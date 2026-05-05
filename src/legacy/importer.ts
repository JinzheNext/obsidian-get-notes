import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs-extra";
import { App, normalizePath } from "obsidian";
import { LEGACY_CACHE_LOC } from "./const";
import { LegacyExportError } from "./errors";
import { legacyLog, legacyStageLog } from "./logger";
import { decodeLegacyDataJson } from "./decodeDataJson";
import { parseLegacyHtmlFallback } from "./htmlFallback";
import { encodeLegacyProgress } from "./progress";
import { canonicalizeLegacyNote } from "../canonical/canonicalizeLegacy";
import { canonicalizeApiNote } from "../canonical/canonicalizeApi";
import { mergeCanonicalNotes } from "../canonical/merge";
import { renderCanonicalMarkdown } from "../canonical/render";
import { commitCanonicalWrite, prepareCanonicalWrite, PreparedCanonicalWrite } from "../canonical/state";
import { RawCacheStore } from "../storage/RawCacheStore";
import { normalizeMatchTitle, normalizeText } from "../canonical/common";
import { PluginSyncState, SyncStateEntry } from "../types";
import { ensureVaultFolder, removePathIfExists, toVaultRelativePath, upsertVaultFile, writeBinaryFile } from "../utils/path";

const execFileAsync = promisify(execFile);

export interface LegacyImportConfig {
  pluginId: string;
  rawZipPath: string;
  targetFolder: string;
  state: PluginSyncState;
}

export interface LegacyImportResult {
  parsedNotes: number;
  addedNotes: number;
  updatedNotes: number;
  skippedNotes: number;
  syncedNoteIds: string[];
  state: PluginSyncState;
}

export type LegacyProgressStage =
  | "parsing_zip"
  | "rendering_markdown"
  | "writing_files"
  | "verifying_zip";

interface ApiEnrichmentEntry {
  title: string;
  createdAt: number | null;
  note: ReturnType<typeof canonicalizeApiNote>;
}

function buildLegacyAssetPath(
  targetFolder: string,
  kind: "audio" | "image" | "file",
  stem: string,
  index: number,
  ext: string
): string {
  const folder = kind === "audio" ? "audio" : kind === "image" ? "images" : "files";
  return normalizePath(`${targetFolder}/_assets/${folder}/${stem}-${String(index + 1).padStart(2, "0")}.${ext}`);
}

export class LegacyImporter {
  private rawCache: RawCacheStore;

  constructor(private app: App, private config: LegacyImportConfig, private onProgress?: (stage: string) => void) {
    this.rawCache = new RawCacheStore(app, config.pluginId);
  }

  async import(): Promise<LegacyImportResult> {
    legacyLog("import unzip start");
    this.onProgress?.(encodeLegacyProgress("parsing_zip"));
    legacyStageLog("parsing_zip");
    const tmpDir = path.join(LEGACY_CACHE_LOC, `data-${Date.now()}`);
    await fs.mkdirp(tmpDir);
    await this.extractZip(this.config.rawZipPath, tmpDir);
    this.onProgress?.(encodeLegacyProgress("verifying_zip"));
    legacyStageLog("verifying_zip");

    const notesDir = path.join(tmpDir, "notes");
    const notesData = new Map<string, string>();
    if (await fs.pathExists(notesDir)) {
      for (const file of await fs.readdir(notesDir)) {
        if (!file.endsWith(".html") || file === "index.html") continue;
        notesData.set(file, await fs.readFile(path.join(notesDir, file), "utf8"));
      }
    }
    if (notesData.size === 0) {
      throw new LegacyExportError("PARSE_FAILED", "No note HTML files found in exported ZIP");
    }

    await this.ensureOutputFolders(this.config.targetFolder);

    const filesDir = path.join(notesDir, "files");
    const apiIndex = await this.loadApiEnrichmentIndex();
    const syncedNoteIds: string[] = [];
    let parsedNotes = 0;
    let addedNotes = 0;
    let updatedNotes = 0;
    let skippedNotes = 0;

    this.onProgress?.(encodeLegacyProgress("rendering_markdown"));
    legacyStageLog("rendering_markdown", { parsedNotes: notesData.size });

    const ordered = [...notesData.entries()].sort((left, right) => left[0].localeCompare(right[0]));
    for (const [filename, htmlContent] of ordered) {
      const noteId = filename.replace(/\.html$/, "");
      const fallback = parseLegacyHtmlFallback(noteId, htmlContent);
      if (!fallback) continue;

      let note = canonicalizeLegacyNote(decodeLegacyDataJson(htmlContent), fallback);
      const cachedApiMatch = this.findApiEnrichment(note, apiIndex);
      if (cachedApiMatch) {
        note = mergeCanonicalNotes(cachedApiMatch.note, note);
      }
      let prepared = await prepareCanonicalWrite(this.app, this.config.state, note, this.config.targetFolder);

      if (prepared.existingEntry?.sourceIds.api) {
        const raw = await this.rawCache.read(prepared.existingEntry.sourceIds.api).catch(() => null);
        if (raw) {
          note = mergeCanonicalNotes(canonicalizeApiNote(raw.summary, raw.detail), note);
          prepared = await prepareCanonicalWrite(this.app, this.config.state, note, this.config.targetFolder);
        }
      }

      if (prepared.skipReason) {
        skippedNotes += 1;
        syncedNoteIds.push(noteId);
        continue;
      }

      this.onProgress?.(encodeLegacyProgress("writing_files"));
      const materialized = await this.materializeLegacyAssets(note, prepared, filesDir);
      const markdown = renderCanonicalMarkdown(note, materialized.links, "legacy");
      await upsertVaultFile(this.app, prepared.filePath, markdown);
      await this.cleanupObsoleteAssets(prepared.existingEntry, materialized.paths);
      commitCanonicalWrite(this.config.state, note, prepared, materialized.paths);

      if (prepared.existingEntry) {
        updatedNotes += 1;
      } else {
        addedNotes += 1;
      }
      parsedNotes += 1;
      syncedNoteIds.push(noteId);
    }

    await fs.remove(tmpDir);
    legacyLog("import markdown written", { parsedNotes, addedNotes, updatedNotes, skippedNotes });
    return {
      parsedNotes,
      addedNotes,
      updatedNotes,
      skippedNotes,
      syncedNoteIds,
      state: this.config.state
    };
  }

  private async loadApiEnrichmentIndex(): Promise<ApiEnrichmentEntry[]> {
    const records = await this.rawCache.readAll();
    const index: ApiEnrichmentEntry[] = [];
    for (const record of records) {
      const note = canonicalizeApiNote(record.payload.summary, record.payload.detail);
      index.push({
        title: normalizeMatchTitle(note.title),
        createdAt: note.createdAt,
        note
      });
    }
    return index;
  }

  private findApiEnrichment(
    note: ReturnType<typeof canonicalizeLegacyNote>,
    index: ApiEnrichmentEntry[]
  ): ApiEnrichmentEntry | null {
    const title = normalizeMatchTitle(note.title);
    let best: ApiEnrichmentEntry | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const entry of index) {
      if (entry.title !== title) continue;
      if (note.createdAt !== null && entry.createdAt !== null) {
        const diff = Math.abs(entry.createdAt - note.createdAt);
        if (diff > 5 * 60 * 1000) continue;
        if (diff < bestDiff) {
          best = entry;
          bestDiff = diff;
        }
        continue;
      }
      if (!best) best = entry;
    }
    return best;
  }

  private async materializeLegacyAssets(
    note: ReturnType<typeof canonicalizeLegacyNote>,
    prepared: PreparedCanonicalWrite,
    filesDir: string
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

    const copyAssets = async (
      items: typeof note.assets.audios,
      kind: "audio" | "image" | "file",
      targetPaths: string[]
    ): Promise<void> => {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!item.source.startsWith("files/")) continue;
        const sourcePath = path.join(filesDir, item.source.replace(/^files\//, ""));
        if (!(await fs.pathExists(sourcePath))) continue;
        const ext = item.ext || path.extname(sourcePath).replace(/^\./, "") || (kind === "audio" ? "mp3" : kind === "image" ? "png" : "bin");
        const targetPath = buildLegacyAssetPath(this.config.targetFolder, kind, prepared.stem, index, ext);
        const content = await fs.readFile(sourcePath);
        const binary = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
        await writeBinaryFile(this.app, targetPath, binary);
        targetPaths.push(targetPath);
      }
    };

    await copyAssets(note.assets.audios, "audio", audios);
    await copyAssets(note.assets.images, "image", images);
    await copyAssets(note.assets.files, "file", files);

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

  private async extractZip(zipPath: string, outputDir: string): Promise<void> {
    try {
      if (os.platform() === "darwin") {
        await execFileAsync("ditto", ["-x", "-k", zipPath, outputDir]);
        return;
      }
      await execFileAsync("unzip", ["-o", zipPath, "-d", outputDir]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LegacyExportError("PARSE_FAILED", `解压导出 ZIP 失败：${message}`);
    }
  }
}
