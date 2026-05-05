import { Plugin } from "obsidian";
import { GetApiClient } from "./src/api/GetApiClient";
import { LegacyAuth } from "./src/legacy/auth";
import { LegacySyncService } from "./src/legacy/LegacySyncService";
import { LegacyStateStore } from "./src/storage/LegacyStateStore";
import { SyncEngine } from "./src/sync/SyncEngine";
import { SyncLock } from "./src/sync/SyncLock";
import { summarizeNotice } from "./src/sync/resultTypes";
import { GetNotesSettingTab } from "./src/ui/SettingsTab";
import { GetNotesStatusBar } from "./src/ui/StatusBar";
import { showError, showInfo } from "./src/ui/Notices";
import {
  DEFAULT_LEGACY_SYNC_STATE,
  DEFAULT_SETTINGS,
  DEFAULT_SYNC_STATE,
  GetNotesPluginSettings,
  LegacySyncStage,
  LegacySyncState,
  PluginSyncState,
  SyncMode,
  UnifiedSyncResult
} from "./src/types";
import { SettingsStore } from "./src/storage/SettingsStore";
import { StateStore } from "./src/storage/StateStore";
import { generateMigrationReport } from "./src/migration/report";

export default class GetNotesPlugin extends Plugin {
  settings: GetNotesPluginSettings = DEFAULT_SETTINGS;
  state: PluginSyncState = DEFAULT_SYNC_STATE;
  legacyState: LegacySyncState = DEFAULT_LEGACY_SYNC_STATE;

  private settingsStore = new SettingsStore(this);
  private stateStore = new StateStore(this);
  private legacyStateStore = new LegacyStateStore(this);
  private syncLock = new SyncLock();
  private statusBar!: GetNotesStatusBar;
  private syncEngine!: SyncEngine;
  private legacySyncService!: LegacySyncService;
  private settingsTab!: GetNotesSettingTab;
  private intervalId: number | null = null;
  private ribbonIconEl: HTMLElement | null = null;
  private currentSyncMode: SyncMode | null = null;
  private currentLegacyStage: string | null = null;

  async onload(): Promise<void> {
    this.settings = await this.settingsStore.load();
    this.state = await this.stateStore.load();
    this.legacyState = await this.legacyStateStore.load();
    this.statusBar = new GetNotesStatusBar(this);
    this.syncEngine = new SyncEngine(this.app, this);
    this.legacySyncService = new LegacySyncService(this.app, this);

    this.settingsTab = new GetNotesSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.registerCommands();
    this.applyRibbon();
    this.refreshStatusBar();
    this.refreshInterval();

    if (this.settings.autoSyncOnStartup) {
      window.setTimeout(() => {
        void this.syncNow("startup");
      }, 1000);
    }
  }

  onunload(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async updateSettings(patch: Partial<GetNotesPluginSettings>): Promise<void> {
    this.settings = {
      ...this.settings,
      ...patch,
      syncIntervalMinutes: Math.max(5, patch.syncIntervalMinutes ?? this.settings.syncIntervalMinutes)
    };
    await this.settingsStore.save(this.settings);
    this.applyRibbon();
    this.refreshInterval();
    this.refreshSettingsUI();
  }

  async syncNow(trigger: "manual" | "startup" | "interval" = "manual"): Promise<void> {
    const result = await this.syncLock.runExclusive(async () => {
      this.currentSyncMode = this.settings.syncMode;
      this.currentLegacyStage = this.settings.syncMode === "legacy" ? "正在启动普通登录同步..." : null;
      this.statusBar.setRunning(this.settings.syncMode);
      this.refreshSettingsUI();
      try {
        const syncResult = await this.runSyncForMode(trigger);
        this.refreshStatusBar();
        this.refreshSettingsUI();
        showInfo(summarizeNotice(syncResult));
        return syncResult;
      } finally {
        this.currentSyncMode = null;
        this.currentLegacyStage = null;
        this.refreshSettingsUI();
      }
    });

    if (!result) {
      showInfo("Get Notes 同步已在进行中。");
      return;
    }
  }

  async rebuildFromCache(): Promise<void> {
    const result = await this.syncLock.runExclusive(async () => {
      this.currentSyncMode = "openapi";
      this.statusBar.setRunning("openapi");
      this.state = await this.syncEngine.rebuildFromCache(this.openApiSettings());
      await this.stateStore.save(this.state);
      this.currentSyncMode = null;
      this.refreshStatusBar();
      this.refreshSettingsUI();
      showInfo("已完成从缓存重建。");
      return this.state;
    });
    if (!result) showInfo("Get Notes 同步已在进行中。");
  }

  async testConnection(): Promise<void> {
    if (this.settings.syncMode !== "openapi") {
      throw new Error("测试连接仅在 OpenAPI 模式下可用。");
    }
    this.ensureCredentials();
    const client = new GetApiClient(this.settings.apiKey, this.settings.clientId);
    await client.testConnection();
  }

  hasLegacySession(): boolean {
    return LegacyAuth.hasStoredSession();
  }

  async markLegacyLoggedIn(): Promise<void> {
    this.legacyState = {
      ...this.legacyState,
      lastLoginAt: new Date().toISOString()
    };
    await this.legacyStateStore.save(this.legacyState);
    this.refreshSettingsUI();
  }

  refreshSettingsUI(): void {
    this.settingsTab?.display();
  }

  isSyncRunning(): boolean {
    return this.syncLock.isRunning();
  }

  getCurrentSyncMode(): SyncMode | null {
    return this.currentSyncMode;
  }

  getCurrentLegacyStage(): string | null {
    return this.currentLegacyStage;
  }

  private registerCommands(): void {
    this.addCommand({
      id: "get-notes-sync-now",
      name: "Sync Get Notes Now",
      callback: () => {
        void this.syncNow().catch((error) => {
          this.statusBar.setFailed(this.settings.syncMode);
          showError((error as Error).message);
        });
      }
    });

    this.addCommand({
      id: "get-notes-rebuild-from-cache",
      name: "Rebuild Get Notes From Cache",
      callback: () => {
        void this.rebuildFromCache().catch((error) => {
          this.statusBar.setFailed("openapi");
          showError((error as Error).message);
        });
      }
    });

    this.addCommand({
      id: "get-notes-open-sync-folder",
      name: "Open Get Notes Sync Folder",
      callback: async () => {
        const adapter = this.app.vault.adapter as any;
        const basePath = adapter.getBasePath?.();
        if (!basePath) {
          showError("打开同步目录仅支持桌面端本地文件库。");
          return;
        }
        const { shell } = require("electron") as { shell: { openPath(path: string): Promise<string> } };
        await shell.openPath(`${basePath}/${this.settings.targetFolder}`);
      }
    });
  }

  private applyRibbon(): void {
    if (this.ribbonIconEl) {
      this.ribbonIconEl.remove();
      this.ribbonIconEl = null;
    }
    if (!this.settings.showRibbonIcon) return;
    this.ribbonIconEl = this.addRibbonIcon("folder-sync", "Sync Get Notes", () => {
      void this.syncNow().catch((error) => {
        this.statusBar.setFailed(this.settings.syncMode);
        showError((error as Error).message);
      });
    });
  }

  private refreshInterval(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (!this.settings.autoSyncEnabled) return;
    const intervalMs = Math.max(5, this.settings.syncIntervalMinutes) * 60_000;
    this.intervalId = window.setInterval(() => {
      void this.syncNow("interval").catch((error) => {
        this.statusBar.setFailed(this.settings.syncMode);
        showError((error as Error).message);
      });
    }, intervalMs);
    this.registerInterval(this.intervalId);
  }

  private refreshStatusBar(): void {
    const status = this.state.lastSyncSummary?.status;
    if (status === "failed") {
      this.statusBar.setFailed(this.state.lastSyncSummary?.mode || this.settings.syncMode);
      return;
    }
    this.statusBar.setIdle(this.state.lastSyncAt, this.state.lastSyncSummary?.mode || this.settings.syncMode);
  }

  private ensureCredentials(): void {
    if (!this.settings.apiKey) {
      throw new Error("请先填写 API Key。");
    }
    if (!this.settings.clientId) {
      throw new Error("请先填写 Client ID。");
    }
  }

  private openApiSettings(): GetNotesPluginSettings {
    return this.settings;
  }

  private async runSyncForMode(_trigger: "manual" | "startup" | "interval"): Promise<UnifiedSyncResult> {
    if (this.settings.syncMode === "legacy") {
      const { legacyState, state, result } = await this.legacySyncService.sync(
        this.settings,
        this.state,
        this.legacyState,
        (stage) => {
          this.currentLegacyStage = stage;
          this.statusBar.setRunning("legacy", stage);
          this.refreshSettingsUI();
        },
      );
      this.legacyState = legacyState;
      this.state = state;
      this.state.lastSyncAt = result.finishedAt;
      this.state.lastSyncSummary = result;
      await this.legacyStateStore.save(this.legacyState);
      await this.stateStore.save(this.state);
      await generateMigrationReport(this.app, this.manifest.id, this.settings.targetFolder, this.state).catch(() => undefined);
      this.refreshSettingsUI();
      return result;
    }

    this.ensureCredentials();
    this.state = await this.syncEngine.sync(this.openApiSettings());
    await this.stateStore.save(this.state);
    await generateMigrationReport(this.app, this.manifest.id, this.settings.targetFolder, this.state).catch(() => undefined);
    this.refreshSettingsUI();
    return this.state.lastSyncSummary as UnifiedSyncResult;
  }
}
