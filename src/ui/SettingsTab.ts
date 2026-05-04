import { App, PluginSettingTab, Setting } from "obsidian";
import GetNotesPlugin from "../../main";
import { formatSyncTime } from "../utils/time";
import { showError, showInfo } from "./Notices";

export class GetNotesSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: GetNotesPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Get Notes Settings" });

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Get official OpenAPI API Key")
      .addText((text) =>
        {
          text.inputEl.type = "password";
          return text
            .setPlaceholder("gk_live_xxx")
            .setValue(this.plugin.settings.apiKey)
            .onChange(async (value) => {
              await this.plugin.updateSettings({ apiKey: value.trim() });
            });
        }
      );

    new Setting(containerEl)
      .setName("Client ID")
      .setDesc("Get official OpenAPI Client ID")
      .addText((text) =>
        text
          .setPlaceholder("cli_xxx")
          .setValue(this.plugin.settings.clientId)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ clientId: value.trim() });
          })
      );

    new Setting(containerEl)
      .setName("Target folder")
      .setDesc("Vault folder for synced Get notes")
      .addText((text) =>
        text.setValue(this.plugin.settings.targetFolder).onChange(async (value) => {
          await this.plugin.updateSettings({ targetFolder: value.trim() || "00_Inbox/020 GetNotes" });
        })
      );

    new Setting(containerEl)
      .setName("Auto sync on startup")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSyncOnStartup).onChange(async (value) => {
          await this.plugin.updateSettings({ autoSyncOnStartup: value });
        })
      );

    new Setting(containerEl)
      .setName("Enable interval auto sync")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSyncEnabled).onChange(async (value) => {
          await this.plugin.updateSettings({ autoSyncEnabled: value });
        })
      );

    new Setting(containerEl)
      .setName("Sync interval minutes")
      .setDesc("Minimum 5 minutes")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.syncIntervalMinutes)).onChange(async (value) => {
          const parsed = Math.max(5, Number.parseInt(value || "30", 10) || 30);
          await this.plugin.updateSettings({ syncIntervalMinutes: parsed });
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Download audio")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.downloadAudio).onChange(async (value) => {
          await this.plugin.updateSettings({ downloadAudio: value });
        })
      );

    new Setting(containerEl)
      .setName("Show ribbon icon")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
          await this.plugin.updateSettings({ showRibbonIcon: value });
        })
      );

    const actionSetting = new Setting(containerEl).setName("Actions");
    actionSetting.controlEl.addClass("get-notes-setting-actions");
    actionSetting.addButton((button) =>
      button.setButtonText("Test connection").onClick(async () => {
        try {
          await this.plugin.testConnection();
          showInfo("Get connection is valid.");
        } catch (error) {
          showError((error as Error).message);
        }
      })
    );
    actionSetting.addButton((button) =>
      button.setCta().setButtonText("Sync now").onClick(async () => {
        try {
          await this.plugin.syncNow();
          this.display();
        } catch (error) {
          showError((error as Error).message);
        }
      })
    );
    actionSetting.addButton((button) =>
      button.setButtonText("Rebuild from cache").onClick(async () => {
        try {
          await this.plugin.rebuildFromCache();
          this.display();
        } catch (error) {
          showError((error as Error).message);
        }
      })
    );

    const summary = this.plugin.state.lastSyncSummary;
    const summaryEl = containerEl.createDiv({ cls: "get-notes-setting-summary" });
    summaryEl.createEl("div", {
      text: `Last sync: ${formatSyncTime(this.plugin.state.lastSyncAt)}`
    });
    if (summary) {
      summaryEl.createEl("div", {
        text: `Last result: ${summary.status} | added ${summary.added}, updated ${summary.updated}, skipped ${summary.skipped}, failed ${summary.failed}`
      });
      if (summary.errorMessage) {
        summaryEl.createEl("div", {
          text: `Last error: ${summary.errorMessage}`
        });
      }
    }
  }
}
