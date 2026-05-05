import { App, Plugin } from "obsidian";
import { LegacySyncState, PluginSyncState, UnifiedSyncResult } from "../types";
import { createUnifiedResult } from "../sync/resultTypes";
import { nowIso } from "../utils/time";
import { GetNotesPluginSettings } from "../types";
import { LegacyExporter } from "./exporter";
import { LegacyImporter } from "./importer";
import { toLegacyUserMessage } from "./errors";
import { LegacySyncStage } from "../types";
import { legacyStageLog } from "./logger";
import { decodeLegacyProgress, legacyStageMessage } from "./progress";

export class LegacySyncService {
  constructor(private app: App, private plugin: Plugin) {}

  async sync(
    settings: GetNotesPluginSettings,
    state: PluginSyncState,
    legacyState: LegacySyncState,
    onProgress?: (stage: string) => void,
  ): Promise<{ result: UnifiedSyncResult; legacyState: LegacySyncState; state: PluginSyncState }> {
    const startedAt = nowIso();
    const outputFolder = settings.targetFolder;
    const pluginDir = this.resolvePluginDir();
    let currentStage: LegacySyncStage = "starting";
    let failedAtStage: LegacySyncStage = currentStage;

    try {
      onProgress?.(legacyStageMessage(currentStage));
      legacyStageLog(currentStage, { outputFolder });
      await this.app.vault.adapter.mkdir(outputFolder).catch(() => undefined);
      const exporter = new LegacyExporter(pluginDir);
      const exportResult = await exporter.export((signal) => {
        const decoded = decodeLegacyProgress(signal);
        if (decoded.stage) {
          currentStage = decoded.stage;
          failedAtStage = currentStage;
        }
        onProgress?.(decoded.message);
      });
      const importer = new LegacyImporter(this.app, {
        pluginId: this.plugin.manifest.id,
        rawZipPath: exportResult.rawZipPath,
        targetFolder: outputFolder,
        state
      }, (signal) => {
        const decoded = decodeLegacyProgress(signal);
        if (decoded.stage) {
          currentStage = decoded.stage;
          failedAtStage = currentStage;
        }
        onProgress?.(decoded.message);
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
        state: imported.state,
        result: createUnifiedResult({
          mode: "legacy",
          status: "success",
          startedAt,
          finishedAt: nowIso(),
          stage: currentStage,
          added: imported.addedNotes,
          updated: imported.updatedNotes,
          skipped: imported.skippedNotes,
          total: imported.parsedNotes + imported.skippedNotes,
          outputFolder,
          message: `普通登录模式已同步 ${imported.parsedNotes} 条笔记，跳过 ${imported.skippedNotes} 条。`
        })
      };
    } catch (error) {
      currentStage = "failed";
      return {
        state,
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
