import { App, PluginSettingTab, Setting } from "obsidian";
import GetNotesPlugin from "../../main";
import { buildModeLabel } from "../sync/resultTypes";
import { SyncMode } from "../types";
import { formatSyncTime } from "../utils/time";
import { LegacyAuthModal } from "./LegacyAuthModal";
import { showError, showInfo } from "./Notices";

export class GetNotesSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: GetNotesPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Get Notes 设置" });

    new Setting(containerEl)
      .setName("同步方式")
      .setDesc("选择 Get Notes 同步到你的库中的方式。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("openapi", "API 模式（推荐给会员）")
          .addOption("legacy", "普通登录模式（适合非会员）")
          .setValue(this.plugin.settings.syncMode)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ syncMode: value as SyncMode });
            this.display();
          })
      );

    containerEl.createEl("p", {
      text:
        this.plugin.settings.syncMode === "openapi"
          ? "API 模式使用 Get 官方 API。适合 Get 笔记会员，稳定性更高，推荐优先使用。"
          : "普通登录模式不需要 API Key 或 Client ID。适合无法获取官方 API 的非会员用户，会通过 Get 网页登录与导出流程完成同步。"
    });

    if (this.plugin.settings.syncMode === "openapi") {
      new Setting(containerEl)
        .setName("API Key")
        .setDesc("Get 官方 OpenAPI API Key")
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
        .setDesc("Get 官方 OpenAPI Client ID")
        .addText((text) =>
          text
            .setPlaceholder("cli_xxx")
            .setValue(this.plugin.settings.clientId)
            .onChange(async (value) => {
              await this.plugin.updateSettings({ clientId: value.trim() });
            })
        );
    } else {
      containerEl.createEl("p", {
        text: "如果你不是 Get 笔记 VIP / 会员，建议直接使用“普通登录模式”。这条路径不依赖 API Key，但网页结构变化时可能需要修复。"
      });
      containerEl.createEl("p", {
        text: "普通登录模式依赖 Get 官方网页导出。当前更适合手动触发或低频自动同步，建议将同步间隔设置为 180 分钟以上，或按天使用。"
      });

      const legacySummary = containerEl.createDiv({ cls: "get-notes-legacy-summary" });
      const loggedIn = this.plugin.hasLegacySession();
      legacySummary.createEl("div", {
        text: `登录状态：${loggedIn ? "已登录，可直接同步" : "未登录，请先完成普通登录"}`
      });
      legacySummary.createEl("div", {
        text: `最近登录：${formatSyncTime(this.plugin.legacyState.lastLoginAt)}`
      });
      legacySummary.createEl("div", {
        text: `最近导出：${formatSyncTime(this.plugin.legacyState.lastExportAt)}`
      });

      new Setting(containerEl)
        .setName("普通登录")
        .setDesc("点击后会打开 Get 网页登录流程，适合非会员用户。登录成功后会在上方显示当前状态。")
        .addButton((button) =>
          button.setButtonText(loggedIn ? "重新登录" : "打开普通登录").onClick(() => {
            new LegacyAuthModal(this.app, this.plugin).open();
          })
        );
    }

    new Setting(containerEl)
      .setName("目标目录")
      .setDesc(`同步输出的基础目录。两种模式都会写入同一套目录结构：${this.plugin.settings.targetFolder}`)
      .addText((text) =>
        text.setValue(this.plugin.settings.targetFolder).onChange(async (value) => {
          await this.plugin.updateSettings({ targetFolder: value.trim() || "00_Inbox/020 GetNotes" });
        })
      );

    new Setting(containerEl)
      .setName("启动 Obsidian 时自动同步")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSyncOnStartup).onChange(async (value) => {
          await this.plugin.updateSettings({ autoSyncOnStartup: value });
        })
      );

    new Setting(containerEl)
      .setName("启用定时自动同步")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSyncEnabled).onChange(async (value) => {
          await this.plugin.updateSettings({ autoSyncEnabled: value });
        })
      );

    new Setting(containerEl)
      .setName("同步间隔（分钟）")
      .setDesc(
        this.plugin.settings.syncMode === "legacy"
          ? "普通登录模式建议 180 分钟以上。Get 官方网页导出存在频率限制。"
          : "最少 5 分钟"
      )
      .addText((text) =>
        text.setValue(String(this.plugin.settings.syncIntervalMinutes)).onChange(async (value) => {
          const parsed = Math.max(5, Number.parseInt(value || "30", 10) || 30);
          await this.plugin.updateSettings({ syncIntervalMinutes: parsed });
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("下载音频")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.downloadAudio).onChange(async (value) => {
          await this.plugin.updateSettings({ downloadAudio: value });
        })
      );

    new Setting(containerEl)
      .setName("显示侧边栏按钮")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
          await this.plugin.updateSettings({ showRibbonIcon: value });
        })
      );

    const actionSetting = new Setting(containerEl).setName("操作");
    actionSetting.controlEl.addClass("get-notes-setting-actions");
    if (this.plugin.settings.syncMode === "openapi") {
      actionSetting.addButton((button) =>
        button.setButtonText("测试连接").onClick(async () => {
          try {
            await this.plugin.testConnection();
            showInfo("连接测试成功。");
          } catch (error) {
            showError((error as Error).message);
          }
        })
      );
    }
    actionSetting.addButton((button) =>
      button.setCta().setButtonText("立即同步").onClick(async () => {
        try {
          await this.plugin.syncNow();
          this.display();
        } catch (error) {
          showError((error as Error).message);
        }
      })
    );
    if (this.plugin.settings.syncMode === "openapi") {
      actionSetting.addButton((button) =>
        button.setButtonText("从缓存重建").onClick(async () => {
          try {
            await this.plugin.rebuildFromCache();
            this.display();
          } catch (error) {
            showError((error as Error).message);
          }
        })
      );
    }

    const summary = this.plugin.state.lastSyncSummary;
    const summaryEl = containerEl.createDiv({ cls: "get-notes-setting-summary" });
    if (this.plugin.isSyncRunning()) {
      const runningMode = this.plugin.getCurrentSyncMode();
      const runningLabel = runningMode ? buildModeLabel(runningMode) : "同步";
      summaryEl.createEl("div", {
        text: `当前状态：${runningLabel}进行中`
      });
      if (runningMode === "legacy" && this.plugin.getCurrentLegacyStage()) {
        summaryEl.createEl("div", {
          text: `当前阶段：${this.plugin.getCurrentLegacyStage()}`
        });
      }
    }
    summaryEl.createEl("div", {
      text: `最近同步：${formatSyncTime(this.plugin.state.lastSyncAt)}`
    });
    if (summary) {
      const resultPrefix = this.plugin.isSyncRunning() ? "上次结果" : "最近结果";
      const resultLine =
        summary.mode === "legacy"
          ? `${resultPrefix}：${buildModeLabel(summary.mode)} | ${summary.status} | 导入 ${summary.total ?? summary.added ?? 0}，失败 ${summary.failed ?? 0}`
          : `${resultPrefix}：${buildModeLabel(summary.mode)} | ${summary.status} | 新增 ${summary.added ?? 0}，更新 ${summary.updated ?? 0}，跳过 ${summary.skipped ?? 0}，失败 ${summary.failed ?? 0}`;
      summaryEl.createEl("div", { text: resultLine });
      if (summary.stage) {
        summaryEl.createEl("div", {
          text: `最近阶段：${summary.stage}`
        });
      }
      if (summary.outputFolder) {
        summaryEl.createEl("div", {
          text: `输出目录：${summary.outputFolder}`
        });
      }
      if (summary.errorMessage) {
        summaryEl.createEl("div", {
          text: `最近错误：${summary.errorMessage}`
        });
      }
    }
  }
}
