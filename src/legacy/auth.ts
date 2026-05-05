import fs from "fs-extra";
import type { Browser, BrowserContext, Page } from "playwright";
import { LEGACY_AUTH_FILE, GET_LOGIN_URL, LEGACY_PLAYWRIGHT_CACHE_LOC } from "./const";
import { LegacyExportError } from "./errors";
import { loadPlaywright } from "./playwrightRuntime";

export class LegacyAuth {
  constructor(private pluginDir: string) {
    fs.mkdirpSync(LEGACY_PLAYWRIGHT_CACHE_LOC);
  }

  async requestSmsCode(phone: string): Promise<[boolean, string, Browser?, BrowserContext?, Page?]> {
    let browser: Browser | undefined;
    try {
      const playwright = loadPlaywright(this.pluginDir);
      browser = await playwright.chromium.launch({ headless: false });
      const context = await browser.newContext(playwright.devices["Desktop Chrome"]);
      const page = await context.newPage();
      await page.goto(GET_LOGIN_URL);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      const phoneInput = page.getByPlaceholder("请输入手机号");
      await phoneInput.waitFor({ state: "visible", timeout: 15000 });
      await phoneInput.fill(phone);
      await page.waitForTimeout(1000);
      return [true, "Please complete verification code login in browser.", browser, context, page];
    } catch (error: any) {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
      return [false, error?.message || String(error)];
    }
  }

  async waitForManualLogin(browser: Browser, context: BrowserContext, page: Page): Promise<[boolean, string]> {
    try {
      await page.waitForTimeout(10000);
      await page.waitForURL("**/note**", { timeout: 30000 }).catch(() => undefined);
      if (await page.getByPlaceholder("请输入手机号").isVisible().catch(() => false)) {
        throw new LegacyExportError("LOGIN_TIMEOUT", "Phone input still visible after waiting for login");
      }
      await page.context().storageState({ path: LEGACY_AUTH_FILE });
      await context.close();
      await browser.close();
      return [true, ""];
    } catch (error: any) {
      await browser.close().catch(() => undefined);
      return [false, error?.message || String(error)];
    }
  }

  static hasStoredSession(): boolean {
    return fs.pathExistsSync(LEGACY_AUTH_FILE);
  }
}
