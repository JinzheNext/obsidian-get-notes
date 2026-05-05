import { App, Plugin } from "obsidian";
import { LegacySyncState, UnifiedSyncResult } from "../types";
import { createUnifiedResult } from "../sync/resultTypes";
import { resolveModeTargetFolder } from "../utils/modePaths";
import { nowIso } from "../utils/time";
import { GetNotesPluginSettings } from "../types";
import { LegacyExporter } from "./exporter";
import { LegacyImporter } from "./importer";
import { toLegacyUserMessage } from "./errors";
import { LegacySyncStage } from "../types";
import { legacyStageLog } from "./logger";
import { legacyStageMessage } from "./progress";

export class LegacySyncService {
  constructor(private app: App, private plugin: Plugin) {}

  async sync(
    settings: GetNotesPluginSettings,
    legacyState: LegacySyncState,
    onProgress?: (stage: string) => void,
  ): Promise<{ result: UnifiedSyncResult; legacyState: LegacySyncState }> {
    const startedAt = nowIso();
    const outputFolder = resolveModeTargetFolder(settings.targetFolder, "legacy");
    const pluginDir = this.resolvePluginDir();
    let currentStage: LegacySyncStage = "starting";
    let failedAtStage: LegacySyncStage = currentStage;

    try {
      onProgress?.(legacyStageMessage(currentStage));
      legacyStageLog(currentStage, { outputFolder });
      await this.app.vault.adapter.mkdir(outputFolder).catch(() => undefined);
      const exporter = new LegacyExporter(pluginDir);
      const exportResult = await exporter.export((stage) => {
        currentStage = stage as LegacySyncStage;
        failedAtStage = currentStage;
        onProgress?.(legacyStageMessage(currentStage));
      });
      const importer = new LegacyImporter(this.app, {
        rawZipPath: exportResult.rawZipPath,
        targetFolder: outputFolder,
        syncedNoteIds: legacyState.syncedNoteIds
      }, (stage) => {
        currentStage = stage as LegacySyncStage;
        failedAtStage = currentStage;
        onProgress?.(legacyStageMessage(currentStage));
      });
      const imported = await importer.import();
      currentStage = "completed";
      const nextLegacyState: LegacySyncState = {
        ...legacyState,
        syncedNoteIds: imported.syncedNoteIds,
        lastSyncAt: nowIso(),
        lastExportAt: exportResult.lastExportAt || nowIso(),
        lastStage: currentStage,
      };
      return {
        legacyState: nextLegacyState,
        result: createUnifiedResult({
          mode: "legacy",
          status: "success",
          startedAt,
          finishedAt: nowIso(),
          stage: currentStage,
          added: imported.parsedNotes,
          updated: undefined,
          skipped: undefined,
          total: imported.parsedNotes,
          outputFolder,
          message: `普通登录模式已重建 ${imported.parsedNotes} 条笔记。`
        })
      };
    } catch (error) {
      currentStage = "failed";
      return {
        legacyState: {
          ...legacyState,
          lastStage: failedAtStage,
        },
        result: createUnifiedResult({
          mode: "legacy",
          status: "failed",
          startedAt,
          finishedAt: nowIso(),
          stage: failedAtStage,
          failed: 1,
          outputFolder,
          errorMessage: `${legacyStageMessage(failedAtStage)}：${toLegacyUserMessage(error)}`
        })
      };
    }
  }

  private resolvePluginDir(): string {
    const adapter = this.app.vault.adapter as { getBasePath?: () => string };
    const basePath = adapter.getBasePath?.();
    if (!basePath) {
      throw new Error("普通登录模式仅支持桌面端本地文件库。");
    }
    return `${basePath}/.obsidian/plugins/${this.plugin.manifest.id}`;
  }
}
