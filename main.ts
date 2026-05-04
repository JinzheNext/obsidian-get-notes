import { Plugin } from "obsidian";
import { GetApiClient } from "./src/api/GetApiClient";
import { SyncEngine } from "./src/sync/SyncEngine";
import { SyncLock } from "./src/sync/SyncLock";
import { GetNotesSettingTab } from "./src/ui/SettingsTab";
import { GetNotesStatusBar } from "./src/ui/StatusBar";
import { showError, showInfo } from "./src/ui/Notices";
import { DEFAULT_SETTINGS, DEFAULT_SYNC_STATE, GetNotesPluginSettings, PluginSyncState } from "./src/types";
import { SettingsStore } from "./src/storage/SettingsStore";
import { StateStore } from "./src/storage/StateStore";

export default class GetNotesPlugin extends Plugin {
  settings: GetNotesPluginSettings = DEFAULT_SETTINGS;
  state: PluginSyncState = DEFAULT_SYNC_STATE;

  private settingsStore = new SettingsStore(this);
  private stateStore = new StateStore(this);
  private syncLock = new SyncLock();
  private statusBar!: GetNotesStatusBar;
  private syncEngine!: SyncEngine;
  private intervalId: number | null = null;
  private ribbonIconEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    this.settings = await this.settingsStore.load();
    this.state = await this.stateStore.load();
    this.statusBar = new GetNotesStatusBar(this);
    this.syncEngine = new SyncEngine(this.app, this);

    this.addSettingTab(new GetNotesSettingTab(this.app, this));
    this.registerCommands();
    this.applyRibbon();
    this.refreshStatusBar();
    this.refreshInterval();

    if (this.settings.autoSyncOnStartup) {
      window.setTimeout(() => {
        void this.syncNow();
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
  }

  async syncNow(): Promise<void> {
    const result = await this.syncLock.runExclusive(async () => {
      this.statusBar.setRunning();
      this.ensureCredentials();
      this.state = await this.syncEngine.sync(this.settings);
      this.refreshStatusBar();
      showInfo(
        `Sync completed: ${this.state.lastSyncSummary?.added ?? 0} added, ${this.state.lastSyncSummary?.updated ?? 0} updated, ${this.state.lastSyncSummary?.skipped ?? 0} skipped, ${this.state.lastSyncSummary?.failed ?? 0} failed.`
      );
      return this.state;
    });

    if (!result) {
      showInfo("Get Notes sync is already running.");
      return;
    }
  }

  async rebuildFromCache(): Promise<void> {
    const result = await this.syncLock.runExclusive(async () => {
      this.statusBar.setRunning();
      this.state = await this.syncEngine.rebuildFromCache(this.settings);
      await this.stateStore.save(this.state);
      this.refreshStatusBar();
      showInfo("Get Notes rebuild from cache completed.");
      return this.state;
    });
    if (!result) showInfo("Get Notes sync is already running.");
  }

  async testConnection(): Promise<void> {
    this.ensureCredentials();
    const client = new GetApiClient(this.settings.apiKey, this.settings.clientId);
    await client.testConnection();
  }

  private registerCommands(): void {
    this.addCommand({
      id: "get-notes-sync-now",
      name: "Sync Get Notes Now",
      callback: () => {
        void this.syncNow().catch((error) => {
          this.statusBar.setFailed();
          showError((error as Error).message);
        });
      }
    });

    this.addCommand({
      id: "get-notes-rebuild-from-cache",
      name: "Rebuild Get Notes From Cache",
      callback: () => {
        void this.rebuildFromCache().catch((error) => {
          this.statusBar.setFailed();
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
          showError("Open sync folder is only supported on desktop file system vaults.");
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
        this.statusBar.setFailed();
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
      void this.syncNow().catch((error) => {
        this.statusBar.setFailed();
        showError((error as Error).message);
      });
    }, intervalMs);
    this.registerInterval(this.intervalId);
  }

  private refreshStatusBar(): void {
    const status = this.state.lastSyncSummary?.status;
    if (status === "failed") {
      this.statusBar.setFailed();
      return;
    }
    this.statusBar.setIdle(this.state.lastSyncAt);
  }

  private ensureCredentials(): void {
    if (!this.settings.apiKey) {
      throw new Error("API Key is required before syncing.");
    }
    if (!this.settings.clientId) {
      throw new Error("Client ID is required before syncing.");
    }
  }
}
