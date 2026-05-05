import { App, Modal, Notice, Setting } from "obsidian";
import { LegacyAuth } from "../legacy/auth";
import GetNotesPlugin from "../../main";

export class LegacyAuthModal extends Modal {
  private phone = "";
  private browser: any = null;
  private context: any = null;
  private page: any = null;
  private phoneInputEl: HTMLInputElement | null = null;

  constructor(app: App, private plugin: GetNotesPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "连接到 Get 笔记（普通登录模式）" });

    new Setting(contentEl)
      .setName("手机号")
      .setDesc("请输入你的 Get 笔记手机号")
      .addText((text) => {
        this.phoneInputEl = text.inputEl;
        return text.setPlaceholder("11 位手机号").onChange(async (value) => {
          this.phone = value.replace(/\s+/g, "").trim();
        });
      });

    new Setting(contentEl)
      .setDesc("普通登录模式会复用 Get 现有网页登录流程，不需要 API Key 或 Client ID。")
      .addButton((button) =>
        button.setButtonText("取消").onClick(async () => {
          await this.cleanup();
          this.close();
        })
      )
      .addButton((button) =>
        button.setButtonText("登录").setCta().onClick(async () => {
          this.phone = (this.phoneInputEl?.value || this.phone).replace(/\s+/g, "").trim();
          if (!/^\d{11}$/.test(this.phone)) {
            new Notice("请输入正确的 11 位手机号。");
            return;
          }
          button.setDisabled(true);
          button.setButtonText("正在打开浏览器...");
          const auth = new LegacyAuth(this.resolvePluginDir());
          const result = await auth.requestSmsCode(this.phone);
          if (!result[0]) {
            new Notice(`普通登录失败：${result[1]}`);
            button.setDisabled(false);
            button.setButtonText("登录");
            return;
          }
          this.browser = result[2];
          this.context = result[3];
          this.page = result[4];
          new Notice("请在打开的浏览器窗口中完成验证码登录。", 10000);
          button.setButtonText("等待登录完成...");
          const loginResult = await auth.waitForManualLogin(this.browser, this.context, this.page);
          if (loginResult[0]) {
            await this.plugin.markLegacyLoggedIn();
            new Notice("普通登录已完成。");
            this.close();
          } else {
            new Notice(`普通登录失败：${loginResult[1]}`);
            button.setDisabled(false);
            button.setButtonText("登录");
            await this.cleanup();
          }
        })
      );
  }

  onClose(): void {
    void this.cleanup();
    this.contentEl.empty();
  }

  private async cleanup(): Promise<void> {
    if (!this.browser) return;
    try {
      await this.browser.close();
    } catch (_error) {
      // noop
    }
    this.browser = null;
    this.context = null;
    this.page = null;
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
