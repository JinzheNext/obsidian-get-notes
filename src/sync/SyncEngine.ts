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

function updatedAt(summary: GetNoteSummary): string {
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
    const client = new GetApiClient(settings.apiKey, settings.clientId);
    await client.testConnection();
  }

  async sync(settings: GetNotesPluginSettings): Promise<PluginSyncState> {
    const startedAt = nowIso();
    const counters: SyncCounters = { added: 0, updated: 0, skipped: 0, failed: 0, totalRemote: 0 };
    const state = await this.stateStore.load();

    try {
      const client = new GetApiClient(settings.apiKey, settings.clientId);
      const summaries = await this.fetchAllSummaries(client);
      counters.totalRemote = summaries.length;

      const plan = this.planner.plan(summaries, state);
      counters.skipped = plan.skipped.length;

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
      state.lastSyncSummary = toLastSyncSummary(counters, startedAt, nowIso());
      await this.stateStore.save(state);
      return state;
    } catch (error) {
      state.lastSyncSummary = toLastSyncSummary(counters, startedAt, nowIso(), (error as Error).message);
      await this.stateStore.save(state);
      throw error;
    }
  }

  async rebuildFromCache(settings: GetNotesPluginSettings): Promise<PluginSyncState> {
    const state = await this.stateStore.load();
    await this.registry.clearManagedContent(settings.targetFolder);
    await ensureVaultFolder(this.app, settings.targetFolder);
    if (settings.downloadAudio) {
      await ensureVaultFolder(this.app, normalizePath(`${settings.targetFolder}/_assets/audio`));
    }

    for (const noteState of Object.values(state.notesById).sort((a, b) => a.localSequence - b.localSequence)) {
      const raw = await this.rawCache.read(noteState.noteId);
      if (!raw) {
        noteState.lastError = "Raw cache missing";
        continue;
      }

      const category = resolveCategory(raw.detail?.note_type || raw.summary.note_type);
      const markdownPath = normalizePath(`${settings.targetFolder}/${category}/${noteState.stem}.md`);
      const audioLinks = await this.existingAudioLinks(noteState.audioPaths, markdownPath);
      const markdown = renderMarkdown(raw, noteState.stem, audioLinks);
      await upsertVaultFile(this.app, markdownPath, markdown);

      noteState.category = category;
      noteState.markdownPath = markdownPath;
      noteState.lastContentHash = hashText(markdown);
      noteState.lastError = undefined;
    }

    state.lastSyncAt = nowIso();
    state.lastSyncSummary = {
      startedAt: state.lastSyncAt,
      finishedAt: state.lastSyncAt,
      status: "success",
      added: 0,
      updated: 0,
      skipped: Object.keys(state.notesById).length,
      failed: 0,
      totalRemote: Object.keys(state.notesById).length
    };
    await this.stateStore.save(state);
    return state;
  }

  private async fetchAllSummaries(client: GetApiClient): Promise<GetNoteSummary[]> {
    let sinceId = "0";
    const seen = new Set<string>();
    const summaries: GetNoteSummary[] = [];

    for (;;) {
      const page = await client.listNotes(sinceId);
      const items = pickItems(page) as GetNoteSummary[];
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

    const detailPayload = await client.getNoteDetail(noteId);
    const detail = detailFromPayload(detailPayload);
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
      }
    }

    const audioLinks = audioPaths.map((audioPath) => toVaultRelativeAudioLink(markdownPath, audioPath));
    const markdown = renderMarkdown(rawRecord, stem, audioLinks);

    await upsertVaultFile(this.app, markdownPath, markdown);
    const rawCacheKey = await this.rawCache.write(noteId, rawRecord);

    state.notesById[noteId] = {
      noteId,
      updatedAt: updatedAt(summary),
      createdAt: detail?.created_at || summary.created_at,
      title: detail?.title || summary.title || stem,
      type: detail?.note_type || summary.note_type || "unknown",
      category,
      localSequence,
      stem,
      markdownPath,
      audioPaths,
      rawCacheKey,
      lastSyncedAt: nowIso(),
      lastContentHash: hashText(markdown),
      lastError: undefined
    };
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
}
