import { App, normalizePath, Plugin } from "obsidian";
import { GetApiClient } from "../api/GetApiClient";
import { GetNoteDetail, GetNoteSummary, RawNoteRecord } from "../api/types";
import { AudioDownloader } from "../audio/AudioDownloader";
import { buildAudioPath } from "../audio/AudioPathBuilder";
import { buildStem } from "../render/FileNameBuilder";
import { renderMarkdown } from "../render/MarkdownRenderer";
import { resolveCategory } from "../render/CategoryResolver";
import { ManagedFileRegistry } from "../storage/ManagedFileRegistry";
import { RawCacheStore } from "../storage/RawCacheStore";
import { StateStore } from "../storage/StateStore";
import { noteIdentity, noteTitle, nextCursor, pickItems, unwrapData } from "../storage/helpers";
import { GetNotesPluginSettings, PluginSyncState } from "../types";
import { hashText } from "../utils/hash";
import { debugLog } from "../utils/logger";
import { ensureVaultFolder, removePathIfExists, toVaultRelativeAudioLink, upsertVaultFile } from "../utils/path";
import { nowIso } from "../utils/time";
import { SyncPlanner } from "./SyncPlanner";
import { SyncCounters, toLastSyncSummary } from "./SyncResult";

interface DiscoveredManagedNote {
  noteId: string;
  path: string;
  stem: string;
  localSequence: number;
  category: string;
}

function normalizeAudioUrls(detail: GetNoteDetail | null): string[] {
  const urls = new Set<string>();
  const direct = detail?.audio?.play_url;
  if (typeof direct === "string" && direct) urls.add(direct);

  const walk = (value: unknown): void => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const url = record.audio_url || record.audioUrl || record.url || record.file_url || record.fileUrl;
      if (typeof url === "string" && /^https?:\/\//.test(url) && /\.(m4a|mp3|wav|aac|amr)(\?|$)/i.test(url)) {
        urls.add(url);
      }
      for (const nested of Object.values(record)) walk(nested);
    }
  };

  walk(detail);
  return [...urls];
}

function extForAudio(url: string): string {
  const match = url.match(/\.(m4a|mp3|wav|aac|amr)(?:\?|$)/i);
  return match ? match[1].toLowerCase() : "bin";
}

function summaryUpdatedAt(summary: GetNoteSummary): string {
  return String(summary.updated_at || "");
}

function detailFromPayload(payload: unknown): GetNoteDetail | null {
  const data = unwrapData(payload);
  return (data?.note || data || null) as GetNoteDetail | null;
}

export class SyncEngine {
  private rawCache: RawCacheStore;
  private stateStore: StateStore;
  private planner = new SyncPlanner();
  private registry: ManagedFileRegistry;

  constructor(private app: App, private plugin: Plugin) {
    this.rawCache = new RawCacheStore(app, plugin.manifest.id);
    this.stateStore = new StateStore(plugin);
    this.registry = new ManagedFileRegistry(app);
  }

  async testConnection(settings: GetNotesPluginSettings): Promise<void> {
    debugLog("test connection start");
    const client = new GetApiClient(settings.apiKey, settings.clientId);
    await client.testConnection();
    debugLog("test connection success");
  }

  async sync(settings: GetNotesPluginSettings): Promise<PluginSyncState> {
    const startedAt = nowIso();
    const counters: SyncCounters = { added: 0, updated: 0, skipped: 0, failed: 0, totalRemote: 0 };
    const state = await this.stateStore.load();
    await this.reconcileStateWithVault(state, settings);
    debugLog("sync start", settings.targetFolder);

    try {
      const client = new GetApiClient(settings.apiKey, settings.clientId);
      const summaries = await this.fetchAllSummaries(client);
      counters.totalRemote = summaries.length;
      debugLog("sync fetched summaries", summaries.length);

      const plan = this.planner.plan(summaries, state);
      counters.skipped = plan.skipped.length;
      debugLog("sync plan", {
        added: plan.added.length,
        updated: plan.updated.length,
        skipped: plan.skipped.length
      });

      await ensureVaultFolder(this.app, settings.targetFolder);
      if (settings.downloadAudio) {
        await ensureVaultFolder(this.app, normalizePath(`${settings.targetFolder}/_assets/audio`));
      }

      const downloader = new AudioDownloader(this.app, client);
      for (const summary of [...plan.added, ...plan.updated]) {
        try {
          const resultType = state.notesById[noteIdentity(summary)] ? "updated" : "added";
          await this.syncSingleNote(summary, state, settings, client, downloader);
          counters[resultType] += 1;
        } catch (error) {
          counters.failed += 1;
          const noteId = noteIdentity(summary);
          const existing = state.notesById[noteId];
          if (existing) {
            existing.lastError = (error as Error).message;
            state.notesById[noteId] = existing;
          }
          debugLog("sync note failed", noteId, error);
        }
      }

      state.lastSyncAt = nowIso();
      state.lastSyncSummary = toLastSyncSummary(counters, startedAt, nowIso(), undefined, settings.targetFolder);
      await this.stateStore.save(state);
      debugLog("sync complete", state.lastSyncSummary);
      return state;
    } catch (error) {
      state.lastSyncSummary = toLastSyncSummary(
        counters,
        startedAt,
        nowIso(),
        (error as Error).message,
        settings.targetFolder
      );
      await this.stateStore.save(state);
      debugLog("sync failed", error);
      throw error;
    }
  }

  async rebuildFromCache(settings: GetNotesPluginSettings): Promise<PluginSyncState> {
    const state = await this.stateStore.load();
    await this.reconcileStateWithVault(state, settings);
    debugLog("rebuild start", {
      targetFolder: settings.targetFolder,
      trackedNotes: Object.keys(state.notesById).length
    });
    await this.registry.clearManagedContent(settings.targetFolder, state);
    await ensureVaultFolder(this.app, settings.targetFolder);
    if (settings.downloadAudio) {
      await ensureVaultFolder(this.app, normalizePath(`${settings.targetFolder}/_assets/audio`));
    }

    let rebuilt = 0;
    let failed = 0;
    for (const noteState of Object.values(state.notesById).sort((a, b) => a.localSequence - b.localSequence)) {
      const raw = await this.rawCache.read(noteState.noteId);
      if (!raw) {
        noteState.lastError = "Raw cache missing";
        failed += 1;
        debugLog("rebuild missing raw cache", noteState.noteId);
        continue;
      }

      const category = resolveCategory(raw.detail?.note_type || raw.summary.note_type);
      const markdownPath = normalizePath(`${settings.targetFolder}/${category}/${noteState.stem}.md`);
      const audioLinks = await this.existingAudioLinks(noteState.audioPaths, markdownPath);
      const markdown = renderMarkdown(raw, noteState.stem, audioLinks);
      await upsertVaultFile(this.app, markdownPath, markdown);
      debugLog("rebuild wrote markdown", markdownPath);

      noteState.category = category;
      noteState.markdownPath = markdownPath;
      noteState.lastContentHash = hashText(markdown);
      noteState.lastError = undefined;
      rebuilt += 1;
    }

    state.lastSyncAt = nowIso();
    state.lastSyncSummary = {
      mode: "openapi",
      startedAt: state.lastSyncAt,
      finishedAt: state.lastSyncAt,
      status: failed > 0 ? (rebuilt > 0 ? "partial_success" : "failed") : "success",
      added: 0,
      updated: rebuilt,
      skipped: Math.max(0, Object.keys(state.notesById).length - rebuilt - failed),
      failed,
      total: Object.keys(state.notesById).length,
      totalRemote: Object.keys(state.notesById).length,
      outputFolder: settings.targetFolder
    };
    await this.stateStore.save(state);
    debugLog("rebuild complete", state.lastSyncSummary);
    return state;
  }

  private async fetchAllSummaries(client: GetApiClient): Promise<GetNoteSummary[]> {
    let sinceId = "0";
    const seen = new Set<string>();
    const summaries: GetNoteSummary[] = [];

    for (;;) {
      const page = await client.listNotes(sinceId);
      const items = pickItems(page) as GetNoteSummary[];
      debugLog("sync page", { sinceId, itemCount: items.length });
      if (!items.length) break;

      let added = 0;
      for (const item of items) {
        const id = noteIdentity(item);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        summaries.push(item);
        added += 1;
      }

      const cursor = nextCursor(page, items);
      if (!cursor || added === 0 || cursor === sinceId) break;
      sinceId = cursor;
    }

    return summaries;
  }

  private async syncSingleNote(
    summary: GetNoteSummary,
    state: PluginSyncState,
    settings: GetNotesPluginSettings,
    client: GetApiClient,
    downloader: AudioDownloader
  ): Promise<void> {
    const noteId = noteIdentity(summary);
    const existing = state.notesById[noteId];
    const localSequence = existing?.localSequence ?? state.nextLocalSequence;
    const stem = existing?.stem ?? buildStem(localSequence, noteTitle(summary), noteId);
    if (!existing) state.nextLocalSequence += 1;
    debugLog("sync note start", { noteId, stem, existing: Boolean(existing) });

    const detailPayload = await client.getNoteDetail(noteId);
    const detail = detailFromPayload(detailPayload);
    debugLog("sync note detail fetched", noteId);
    const rawRecord: RawNoteRecord = {
      summary,
      detailPayload,
      detail,
      original: detail?.audio?.original || null
    };

    const category = resolveCategory(detail?.note_type || summary.note_type);
    const markdownPath = normalizePath(`${settings.targetFolder}/${category}/${stem}.md`);

    const audioPaths: string[] = [];
    if (settings.downloadAudio) {
      for (const oldPath of existing?.audioPaths || []) {
        await removePathIfExists(this.app, oldPath);
      }
      const audioUrls = normalizeAudioUrls(detail);
      for (let index = 0; index < audioUrls.length; index += 1) {
        const url = audioUrls[index];
        const audioPath = buildAudioPath(settings.targetFolder, noteId, index, extForAudio(url));
        await downloader.download(url, audioPath);
        audioPaths.push(audioPath);
        debugLog("sync note audio saved", audioPath);
      }
    }

    const audioLinks = audioPaths.map((audioPath) => toVaultRelativeAudioLink(markdownPath, audioPath));
    const markdown = renderMarkdown(rawRecord, stem, audioLinks);

    await upsertVaultFile(this.app, markdownPath, markdown);
    debugLog("sync note markdown saved", markdownPath);
    const rawCacheKey = await this.rawCache.write(noteId, rawRecord);
    debugLog("sync note raw cache saved", rawCacheKey);

    state.notesById[noteId] = {
      noteId,
      updatedAt: summaryUpdatedAt(summary),
      createdAt: detail?.created_at || summary.created_at,
      title: detail?.title || summary.title || stem,
      type: detail?.note_type || summary.note_type || "unknown",
      category,
      localSequence,
      stem,
      markdownPath,
      duplicateMarkdownPaths: [],
      audioPaths,
      rawCacheKey,
      lastSyncedAt: nowIso(),
      lastContentHash: hashText(markdown),
      lastError: undefined
    };

    const obsoleteMarkdownPaths = new Set<string>();
    if (existing?.markdownPath && normalizePath(existing.markdownPath) !== markdownPath) {
      obsoleteMarkdownPaths.add(normalizePath(existing.markdownPath));
    }
    for (const duplicatePath of existing?.duplicateMarkdownPaths || []) {
      const normalized = normalizePath(duplicatePath);
      if (normalized !== markdownPath) obsoleteMarkdownPaths.add(normalized);
    }
    for (const obsoletePath of obsoleteMarkdownPaths) {
      await removePathIfExists(this.app, obsoletePath);
      debugLog("sync note removed obsolete markdown", obsoletePath);
    }
  }

  private async existingAudioLinks(audioPaths: string[], markdownPath: string): Promise<string[]> {
    const links: string[] = [];
    for (const audioPath of audioPaths) {
      if (await this.app.vault.adapter.exists(audioPath)) {
        links.push(toVaultRelativeAudioLink(markdownPath, audioPath));
      }
    }
    return links;
  }

  private async reconcileStateWithVault(state: PluginSyncState, settings: GetNotesPluginSettings): Promise<void> {
    const discovered = await this.discoverManagedNotes(settings.targetFolder);
    if (!discovered.length) return;

    const byNoteId = new Map<string, DiscoveredManagedNote[]>();
    for (const candidate of discovered) {
      const existing = byNoteId.get(candidate.noteId) || [];
      existing.push(candidate);
      byNoteId.set(candidate.noteId, existing);
    }

    let changed = false;
    for (const [noteId, candidates] of byNoteId.entries()) {
      const sorted = [...candidates].sort((left, right) => {
        if (left.localSequence !== right.localSequence) return left.localSequence - right.localSequence;
        return left.path.localeCompare(right.path);
      });

      const existing = state.notesById[noteId];
      const preferredPath = existing?.markdownPath ? normalizePath(existing.markdownPath) : null;
      const canonical =
        sorted.find((candidate) => normalizePath(candidate.path) === preferredPath) || sorted[0];
      const duplicateMarkdownPaths = sorted
        .filter((candidate) => normalizePath(candidate.path) !== normalizePath(canonical.path))
        .map((candidate) => normalizePath(candidate.path));

      const raw = await this.rawCache.read(noteId).catch(() => null);
      const rawSummary = raw?.summary;
      const rawDetail = raw?.detail;
      const rawType = rawDetail?.note_type || rawSummary?.note_type;
      const nextState = {
        ...existing,
        noteId,
        updatedAt: existing?.updatedAt || (rawSummary ? summaryUpdatedAt(rawSummary) : ""),
        createdAt: existing?.createdAt || rawDetail?.created_at || rawSummary?.created_at,
        title: existing?.title || rawDetail?.title || rawSummary?.title || canonical.stem,
        type: existing?.type || rawType || "unknown",
        category: rawType ? resolveCategory(rawType) : canonical.category,
        localSequence: existing?.localSequence || canonical.localSequence,
        stem: existing?.stem || canonical.stem,
        markdownPath: canonical.path,
        duplicateMarkdownPaths,
        audioPaths: existing?.audioPaths || [],
        rawCacheKey: existing?.rawCacheKey || `${noteId}.json`,
        lastSyncedAt: existing?.lastSyncedAt || state.lastSyncAt || nowIso(),
        lastContentHash: existing?.lastContentHash,
        lastError: existing?.lastError
      };

      if (JSON.stringify(existing) !== JSON.stringify(nextState)) {
        state.notesById[noteId] = nextState;
        changed = true;
      }

      if (duplicateMarkdownPaths.length > 0) {
        debugLog("reconcile detected duplicate markdowns", { noteId, duplicateMarkdownPaths });
      }
    }

    const maxSequence = Object.values(state.notesById).reduce((max, noteState) => {
      return Number.isFinite(noteState.localSequence) ? Math.max(max, noteState.localSequence) : max;
    }, 0);
    const nextLocalSequence = maxSequence + 1;
    if (state.nextLocalSequence !== nextLocalSequence) {
      state.nextLocalSequence = nextLocalSequence;
      changed = true;
    }

    if (changed) {
      await this.stateStore.save(state);
      debugLog("reconcile state with vault complete", {
        trackedNotes: Object.keys(state.notesById).length,
        nextLocalSequence: state.nextLocalSequence
      });
    }
  }

  private async discoverManagedNotes(targetFolder: string): Promise<DiscoveredManagedNote[]> {
    const markdownPaths = await this.listMarkdownFiles(targetFolder);
    const discovered: DiscoveredManagedNote[] = [];
    for (const path of markdownPaths) {
      const normalized = normalizePath(path);
      const fileName = normalized.split("/").pop() || "";
      const match = fileName.match(/^(\d+)-(.+)-(\d{8,})\.md$/);
      if (!match) continue;

      discovered.push({
        noteId: match[3],
        path: normalized,
        stem: fileName.replace(/\.md$/, ""),
        localSequence: Number.parseInt(match[1], 10) || 0,
        category: normalized.split("/").slice(-2, -1)[0] || "99 其他"
      });
    }
    return discovered;
  }

  private async listMarkdownFiles(root: string): Promise<string[]> {
    const normalizedRoot = normalizePath(root);
    const exists = await this.app.vault.adapter.exists(normalizedRoot);
    if (!exists) return [];

    const results: string[] = [];
    const walk = async (currentPath: string): Promise<void> => {
      const listing = await this.app.vault.adapter.list(currentPath).catch(() => null);
      if (!listing) return;

      for (const filePath of listing.files) {
        if (filePath.endsWith(".md")) results.push(normalizePath(filePath));
      }
      for (const folderPath of listing.folders) {
        await walk(folderPath);
      }
    };

    await walk(normalizedRoot);
    return results;
  }
}
