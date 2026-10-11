import { App, normalizePath, Plugin } from "obsidian";
import { GetApiClient } from "../api/GetApiClient";
import { GetNoteDetail, GetNoteSummary } from "../api/types";
import { AudioDownloader } from "../audio/AudioDownloader";
import { canonicalizeApiNote } from "../canonical/canonicalizeApi";
import { renderCanonicalMarkdown } from "../canonical/render";
import { commitCanonicalWrite, prepareCanonicalWrite, PreparedCanonicalWrite } from "../canonical/state";
import { ManagedFileRegistry } from "../storage/ManagedFileRegistry";
import { RawCacheStore } from "../storage/RawCacheStore";
import { StateStore } from "../storage/StateStore";
import { nextCursor, noteIdentity, pickItems, unwrapData } from "../storage/helpers";
import { GetNotesPluginSettings, PluginSyncState, SyncStateEntry } from "../types";
import { debugLog } from "../utils/logger";
import { ensureVaultFolder, removePathIfExists, toVaultRelativePath, upsertVaultFile } from "../utils/path";
import { nowIso } from "../utils/time";
import { SyncCounters, toLastSyncSummary } from "./SyncResult";

function detailFromPayload(payload: unknown): GetNoteDetail | null {
  const data = unwrapData(payload);
  return (data?.note || data || null) as GetNoteDetail | null;
}

function assetExt(url: string, fallback: string): string {
  return url.match(/\.([a-z0-9]{1,10})(?:\?|$)/i)?.[1]?.toLowerCase() || fallback;
}

function buildAssetTargetPath(
  targetFolder: string,
  kind: "audio" | "image" | "file",
  stem: string,
  index: number,
  ext: string
): string {
  const folder = kind === "audio" ? "audio" : kind === "image" ? "images" : "files";
  return normalizePath(`${targetFolder}/_assets/${folder}/${stem}-${String(index + 1).padStart(2, "0")}.${ext}`);
}

export class SyncEngine {
  private rawCache: RawCacheStore;
  private stateStore: StateStore;
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
    const restoreMissingFiles = await this.shouldRestoreMissingFiles(state, settings.targetFolder);

    try {
      await this.ensureOutputFolders(settings.targetFolder);
      const client = new GetApiClient(settings.apiKey, settings.clientId);
      const downloader = new AudioDownloader(this.app, client);
      const summaries = await this.fetchAllSummaries(client);
      counters.totalRemote = summaries.length;

      for (const summary of summaries) {
        try {
          const detailPayload = await client.getNoteDetail(noteIdentity(summary));
          const detail = detailFromPayload(detailPayload);
          const note = canonicalizeApiNote(summary, detail);
          const prepared = await prepareCanonicalWrite(this.app, state, note, settings.targetFolder, {
            restoreMissingFiles
          });
          if (prepared.skipReason) {
            counters.skipped += 1;
            continue;
          }

          const materialized = await this.materializeApiAssets(note, prepared, settings, downloader);
          const markdown = renderCanonicalMarkdown(note, materialized.links, "api");
          await upsertVaultFile(this.app, prepared.filePath, markdown);
          await this.cleanupObsoleteAssets(prepared.existingEntry, materialized.paths);
          commitCanonicalWrite(state, note, prepared, materialized.paths);
          if (note.sourceIds.api) {
            await this.rawCache.write(note.sourceIds.api, {
              summary,
              detailPayload,
              detail,
              original: detail?.audio?.original || null
            });
          }
          if (prepared.existingEntry) {
            counters.updated += 1;
          } else {
            counters.added += 1;
          }
        } catch (error) {
          counters.failed += 1;
          debugLog("sync note failed", noteIdentity(summary), error);
        }
      }

      state.lastSyncAt = nowIso();
      state.lastSyncSummary = toLastSyncSummary(counters, startedAt, nowIso(), undefined, settings.targetFolder);
      await this.stateStore.save(state);
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
      throw error;
    }
  }

  private async shouldRestoreMissingFiles(state: PluginSyncState, targetFolder: string): Promise<boolean> {
    const trackedEntries = Object.values(state.notesByCanonicalId);
    if (trackedEntries.length < 20) return false;

    let existingTrackedFiles = 0;
    for (const entry of trackedEntries) {
      if (!entry.filePath) continue;
      if (await this.app.vault.adapter.exists(normalizePath(entry.filePath))) {
        existingTrackedFiles += 1;
      }
    }

    const folderMismatch =
      !!state.lastSyncSummary?.outputFolder &&
      normalizePath(state.lastSyncSummary.outputFolder) !== normalizePath(targetFolder);
    const previousModeWasLegacy = state.lastSyncSummary?.mode === "legacy";
    const almostEverythingMissing = existingTrackedFiles <= Math.max(2, Math.floor(trackedEntries.length * 0.02));

    return almostEverythingMissing && (folderMismatch || previousModeWasLegacy);
  }

  async rebuildFromCache(settings: GetNotesPluginSettings): Promise<PluginSyncState> {
    const state = await this.stateStore.load();
    await this.registry.clearManagedContent(settings.targetFolder, state);
    await this.ensureOutputFolders(settings.targetFolder);

    const client = new GetApiClient(settings.apiKey, settings.clientId);
    const downloader = new AudioDownloader(this.app, client);
    let rebuilt = 0;
    let failed = 0;
    let skipped = 0;

    for (const entry of Object.values(state.notesByCanonicalId).sort((a, b) => a.localSequence - b.localSequence)) {
      if (entry.deleted) {
        skipped += 1;
        continue;
      }
      const apiId = entry.sourceIds.api;
      if (!apiId) {
        skipped += 1;
        continue;
      }

      const raw = await this.rawCache.read(apiId);
      if (!raw) {
        failed += 1;
        continue;
      }

      try {
        const note = canonicalizeApiNote(raw.summary, raw.detail);
        const prepared: PreparedCanonicalWrite = {
          canonicalId: entry.canonicalId,
          existingKey: entry.canonicalId,
          existingEntry: entry,
          localSequence: entry.localSequence,
          stem: entry.stem,
          filePath: entry.filePath
        };
        const materialized = await this.materializeApiAssets(note, prepared, settings, downloader);
        const markdown = renderCanonicalMarkdown(note, materialized.links, "api");
        await upsertVaultFile(this.app, prepared.filePath, markdown);
        commitCanonicalWrite(state, note, prepared, materialized.paths);
        rebuilt += 1;
      } catch (_error) {
        failed += 1;
      }
    }

    state.lastSyncAt = nowIso();
    state.lastSyncSummary = {
      mode: "openapi",
      startedAt: state.lastSyncAt,
      finishedAt: state.lastSyncAt,
      status: failed > 0 ? (rebuilt > 0 ? "partial_success" : "failed") : "success",
      added: 0,
      updated: rebuilt,
      skipped,
      failed,
      total: rebuilt + skipped + failed,
      totalRemote: rebuilt + skipped + failed,
      outputFolder: settings.targetFolder
    };
    await this.stateStore.save(state);
    return state;
  }

  private async ensureOutputFolders(targetFolder: string): Promise<void> {
    await ensureVaultFolder(this.app, targetFolder);
    await ensureVaultFolder(this.app, normalizePath(`${targetFolder}/01 语音记录`));
    await ensureVaultFolder(this.app, normalizePath(`${targetFolder}/02 多人会议`));
    await ensureVaultFolder(this.app, normalizePath(`${targetFolder}/03 纯文本记录`));
    await ensureVaultFolder(this.app, normalizePath(`${targetFolder}/04 链接同步摘抄`));
    await ensureVaultFolder(this.app, normalizePath(`${targetFolder}/99 其他`));
    await ensureVaultFolder(this.app, normalizePath(`${targetFolder}/_assets/audio`));
    await ensureVaultFolder(this.app, normalizePath(`${targetFolder}/_assets/images`));
    await ensureVaultFolder(this.app, normalizePath(`${targetFolder}/_assets/files`));
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

  private async materializeApiAssets(
    note: ReturnType<typeof canonicalizeApiNote>,
    prepared: PreparedCanonicalWrite,
    settings: GetNotesPluginSettings,
    downloader: AudioDownloader
  ): Promise<{
    paths: SyncStateEntry["assetPaths"];
    links: {
      audios: string[];
      images: string[];
      files: string[];
    };
  }> {
    const audios: string[] = [];
    const images: string[] = [];
    const files: string[] = [];

    if (settings.downloadAudio) {
      for (let index = 0; index < note.assets.audios.length; index += 1) {
        const asset = note.assets.audios[index];
        const targetPath = buildAssetTargetPath(settings.targetFolder, "audio", prepared.stem, index, asset.ext || assetExt(asset.source, "mp3"));
        await downloader.download(asset.source, targetPath);
        audios.push(targetPath);
      }
    }

    for (let index = 0; index < note.assets.images.length; index += 1) {
      const asset = note.assets.images[index];
      const targetPath = buildAssetTargetPath(settings.targetFolder, "image", prepared.stem, index, asset.ext || assetExt(asset.source, "png"));
      await downloader.download(asset.source, targetPath);
      images.push(targetPath);
    }

    for (let index = 0; index < note.assets.files.length; index += 1) {
      const asset = note.assets.files[index];
      const targetPath = buildAssetTargetPath(settings.targetFolder, "file", prepared.stem, index, asset.ext || assetExt(asset.source, "bin"));
      await downloader.download(asset.source, targetPath);
      files.push(targetPath);
    }

    return {
      paths: { audios, images, files },
      links: {
        audios: audios.map((value) => toVaultRelativePath(prepared.filePath, value)),
        images: images.map((value) => toVaultRelativePath(prepared.filePath, value)),
        files: files.map((value) => toVaultRelativePath(prepared.filePath, value))
      }
    };
  }

  private async cleanupObsoleteAssets(
    existingEntry: SyncStateEntry | undefined,
    nextPaths: SyncStateEntry["assetPaths"]
  ): Promise<void> {
    if (!existingEntry) return;
    const keep = new Set([...nextPaths.audios, ...nextPaths.images, ...nextPaths.files].map((value) => normalizePath(value)));
    const previous = [...existingEntry.assetPaths.audios, ...existingEntry.assetPaths.images, ...existingEntry.assetPaths.files];
    for (const assetPath of previous) {
      if (keep.has(normalizePath(assetPath))) continue;
      await removePathIfExists(this.app, assetPath);
    }
  }
}
