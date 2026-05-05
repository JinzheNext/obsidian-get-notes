import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs-extra";
import { App } from "obsidian";
import { LEGACY_CACHE_LOC } from "./const";
import { LegacyGetCore } from "./core";
import { LegacyExportError } from "./errors";
import { legacyLog, legacyStageLog } from "./logger";
import { LegacyAttachmentRef, renderLegacyMarkdown } from "./render";
import { resolveCategory } from "../render/CategoryResolver";
import { buildStem } from "../render/FileNameBuilder";
import { ensureVaultFolder, toVaultRelativePath, writeBinaryFile } from "../utils/path";

const execFileAsync = promisify(execFile);

export interface LegacyImportConfig {
  rawZipPath: string;
  targetFolder: string;
  syncedNoteIds: string[];
}

export interface LegacyImportResult {
  parsedNotes: number;
  newNotes: number;
  syncedNoteIds: string[];
}

export type LegacyProgressStage =
  | "parsing_zip"
  | "rendering_markdown"
  | "writing_files"
  | "verifying_zip";

export class LegacyImporter {
  constructor(private app: App, private config: LegacyImportConfig, private onProgress?: (stage: LegacyProgressStage) => void) {}

  async import(): Promise<LegacyImportResult> {
    legacyLog("import unzip start");
    this.onProgress?.("parsing_zip");
    legacyStageLog("parsing_zip");
    const tmpDir = path.join(LEGACY_CACHE_LOC, `data-${Date.now()}`);
    await fs.mkdirp(tmpDir);
    await this.extractZip(this.config.rawZipPath, tmpDir);
    legacyLog("import unzip complete", { rawPath: this.config.rawZipPath, tmpDir });
    this.onProgress?.("verifying_zip");
    legacyStageLog("verifying_zip");

    const notesDir = path.join(tmpDir, "notes");
    const notesData = new Map<string, string>();
    if (await fs.pathExists(notesDir)) {
      for (const file of await fs.readdir(notesDir)) {
        if (!file.endsWith(".html") || file === "index.html") continue;
        notesData.set(file, await fs.readFile(path.join(notesDir, file), "utf8"));
      }
    }
    legacyLog("import notes discovered", { notes: notesData.size });
    if (notesData.size === 0) {
      throw new LegacyExportError("PARSE_FAILED", "No note HTML files found in exported ZIP");
    }

    const attachmentRoot = `${this.config.targetFolder}/_assets`;
    const filesDir = path.join(notesDir, "files");
    const core = new LegacyGetCore(notesData, []);

    this.onProgress?.("rendering_markdown");
    legacyStageLog("rendering_markdown", { parsedNotes: core.notes.length });

    const notes = [...core.notes].sort((left, right) => {
      const timeCompare = left.dateTime.localeCompare(right.dateTime);
      if (timeCompare !== 0) return timeCompare;
      return left.id.localeCompare(right.id);
    });

    for (const [index, note] of notes.entries()) {
      const stem = buildStem(index + 1, note.title, note.id);
      const category = resolveCategory(note.noteKind);
      const folder = `${this.config.targetFolder}/${category}`;
      const filePath = `${folder}/${stem}.md`;
      await ensureVaultFolder(this.app, folder);
      this.onProgress?.("writing_files");
      const attachmentLinks = await this.writeAttachments(note.attachments, filesDir, attachmentRoot, stem, filePath);
      const markdown = renderLegacyMarkdown(note, stem, attachmentLinks);
      await this.app.vault.adapter.write(filePath, markdown);
    }

    await fs.remove(tmpDir);
    legacyLog("import markdown written", { parsedNotes: core.memos.length, newNotes: core.memos.length });
    return {
      parsedNotes: core.memos.length,
      newNotes: core.memos.length,
      syncedNoteIds: notes.map((note) => note.id),
    };
  }

  private async writeAttachments(
    attachments: LegacyAttachmentRef[],
    filesDir: string,
    attachmentRoot: string,
    stem: string,
    markdownPath: string,
  ): Promise<string[]> {
    const links: string[] = [];
    let audioIndex = 0;
    let imageIndex = 0;
    let fileIndex = 0;

    for (const attachment of attachments) {
      if (!attachment.source.startsWith("files/")) continue;
      const originalName = attachment.source.replace("files/", "");
      const sourcePath = path.join(filesDir, originalName);
      if (!await fs.pathExists(sourcePath)) continue;

      const ext = path.extname(originalName) || (attachment.type === "audio" ? ".mp3" : attachment.type === "image" ? ".png" : "");
      let targetPath = "";
      if (attachment.type === "audio") {
        audioIndex += 1;
        targetPath = `${attachmentRoot}/audio/${stem}-${String(audioIndex).padStart(2, "0")}${ext}`;
      } else if (attachment.type === "image") {
        imageIndex += 1;
        targetPath = `${attachmentRoot}/images/${stem}-${String(imageIndex).padStart(2, "0")}${ext}`;
      } else {
        fileIndex += 1;
        targetPath = `${attachmentRoot}/files/${stem}-${String(fileIndex).padStart(2, "0")}${ext}`;
      }

      const content = await fs.readFile(sourcePath);
      const binary = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
      await writeBinaryFile(this.app, targetPath, binary);
      links.push(toVaultRelativePath(markdownPath, targetPath));
    }

    return links;
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
