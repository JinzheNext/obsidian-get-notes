import fs from "fs-extra";
import http from "http";
import https from "https";
import type { Locator, Page } from "playwright";
import { LEGACY_AUTH_FILE, LEGACY_DOWNLOAD_FILE, GET_EXPORT_CANDIDATE_URLS, LEGACY_PLAYWRIGHT_CACHE_LOC } from "./const";
import { LegacyExportError } from "./errors";
import { legacyLog, legacyStageLog, legacyWarn } from "./logger";
import { loadPlaywright } from "./playwrightRuntime";

type ExportTask = {
  id?: string;
  access_url?: string;
  status?: string;
  finished?: boolean;
  total?: number;
  create_time?: number;
  update_time?: number;
  result?: {
    percent?: number;
    success?: number;
    failed?: number;
    pending?: number;
  };
};

export interface LegacyExportResult {
  rawZipPath: string;
  lastExportAt?: string;
}

export class LegacyExporter {
  constructor(private pluginDir: string) {}

  async export(onProgress?: (stage: string) => void): Promise<LegacyExportResult> {
    await fs.mkdirp(LEGACY_PLAYWRIGHT_CACHE_LOC);
    if (!await fs.pathExists(LEGACY_AUTH_FILE)) {
      throw new LegacyExportError("LOGIN_REQUIRED", "Missing auth file");
    }
    await fs.remove(LEGACY_DOWNLOAD_FILE).catch(() => undefined);

    const playwright = loadPlaywright(this.pluginDir);
    onProgress?.("opening_browser");
    legacyStageLog("opening_browser");
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ storageState: LEGACY_AUTH_FILE, acceptDownloads: true });
      const page = await context.newPage();
      const latestResponsePromise = page
        .waitForResponse(
          (response) => response.url().includes("/sync/export/tasks?latest=true") && response.status() === 200,
          { timeout: 15000 }
        )
        .catch(() => null);

      legacyLog("export start");
      onProgress?.("checking_login");
      legacyStageLog("checking_login");
      await this.openExportPage(page);
      await page.waitForLoadState("load");
      await page.waitForTimeout(1500);
      const latestTask = await this.readLatestTaskFromResponse(latestResponsePromise);

      if (latestTask?.access_url && latestTask.status === "success") {
        legacyLog("reuse latest export task", latestTask);
        onProgress?.("opening_export_page");
        legacyStageLog("opening_export_page", {
          lastExportAt: this.taskTimeToIso(latestTask),
          status: latestTask.status,
        });
        try {
          onProgress?.("downloading_zip");
          legacyStageLog("downloading_zip");
          await this.downloadLatestExport(page);
        } catch (downloadError) {
          legacyWarn("page download fallback failed, try latest task access_url", downloadError instanceof Error ? downloadError.message : String(downloadError));
          onProgress?.("downloading_zip");
          legacyStageLog("downloading_zip", { fallback: "access_url" });
          await this.downloadFromUrl(latestTask.access_url, LEGACY_DOWNLOAD_FILE);
        }

        if (!await fs.pathExists(LEGACY_DOWNLOAD_FILE)) {
          throw new LegacyExportError("ZIP_NOT_FOUND", "Latest export download did not produce a ZIP file");
        }

        onProgress?.("verifying_zip");
        legacyStageLog("verifying_zip");
        await this.verifyDownloadedZip();
        await context.close();
        return {
          rawZipPath: LEGACY_DOWNLOAD_FILE,
          lastExportAt: this.taskTimeToIso(latestTask),
        };
      }

      const exportButton = await this.findExportButton(page);
      onProgress?.("triggering_export");
      legacyStageLog("triggering_export");
      await exportButton.click({ timeout: 5000 });
      const createResponse = await page.waitForResponse(
        (response) => response.url().includes("/sync/export/create") && response.request().method() === "POST",
        { timeout: 30000 }
      );
      const createPayload = await createResponse.json().catch(() => null) as any;
      legacyLog("export create response", createPayload);
      const taskId = String(createPayload?.c?.data?.id || "");
      if (!taskId) {
        if (latestTask?.access_url && latestTask.status === "success") {
          legacyWarn("export task id missing, fallback to latest export task", latestTask);
          try {
            onProgress?.("downloading_zip");
            legacyStageLog("downloading_zip", { fallback: "latest_task_after_rate_limit" });
            await this.downloadLatestExport(page);
          } catch (downloadError) {
            legacyWarn("page download fallback failed, try latest task access_url", downloadError instanceof Error ? downloadError.message : String(downloadError));
            onProgress?.("downloading_zip");
            legacyStageLog("downloading_zip", { fallback: "access_url_after_rate_limit" });
            await this.downloadFromUrl(latestTask.access_url, LEGACY_DOWNLOAD_FILE);
          }
        } else {
          throw new LegacyExportError("DOWNLOAD_TIMEOUT", createPayload?.h?.e || "Export task id was not returned");
        }
      } else {
        onProgress?.("waiting_for_export_task");
        legacyStageLog("waiting_for_export_task", { taskId });
        const task = await this.waitForExportTask(page, taskId);
        if (task?.access_url) {
          onProgress?.("downloading_zip");
          legacyStageLog("downloading_zip");
          await this.downloadFromUrl(task.access_url, LEGACY_DOWNLOAD_FILE);
        } else {
          onProgress?.("downloading_zip");
          legacyStageLog("downloading_zip", { fallback: "download_control_after_task" });
          await this.downloadLatestExport(page);
        }
      }
      if (!await fs.pathExists(LEGACY_DOWNLOAD_FILE)) {
        throw new LegacyExportError("ZIP_NOT_FOUND", "Download file missing after legacy download step");
      }

      onProgress?.("verifying_zip");
      legacyStageLog("verifying_zip");
      await this.verifyDownloadedZip();
      await context.close();
      return {
        rawZipPath: LEGACY_DOWNLOAD_FILE,
        lastExportAt: taskId ? undefined : this.taskTimeToIso(latestTask),
      };
    } finally {
      await browser.close();
    }
  }

  private async openExportPage(page: Page): Promise<void> {
    let lastError: unknown = null;
    for (const candidate of GET_EXPORT_CANDIDATE_URLS) {
      try {
        legacyStageLog("opening_export_page", { candidate });
        await page.goto(candidate, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(1000);
        if (await this.isLoginRequired(page)) {
          throw new LegacyExportError("LOGIN_REQUIRED", `Login required at ${candidate}`);
        }
        if (await this.looksLikeExportHostPage(page)) return;
      } catch (error) {
        lastError = error;
        if (error instanceof LegacyExportError && error.type === "LOGIN_REQUIRED") throw error;
      }
    }
    throw new LegacyExportError(
      "EXPORT_PAGE_NOT_FOUND",
      lastError instanceof Error ? lastError.message : "Could not locate legacy export page"
    );
  }

  private async isLoginRequired(page: Page): Promise<boolean> {
    const phoneInput = page.getByPlaceholder("请输入手机号");
    if (await phoneInput.count().catch(() => 0)) return true;
    const loginText = page.locator("text=登录, text=验证码, text=手机号").first();
    return await loginText.isVisible().catch(() => false);
  }

  private async looksLikeExportHostPage(page: Page): Promise<boolean> {
    const pageText = await page.locator("body").innerText().catch(() => "");
    return /导出笔记|点击导出|下载文件|同步|笔记|导入/.test(pageText);
  }

  private async findExportButton(page: Page): Promise<Locator> {
    legacyStageLog("finding_export_button");
    const selectors = [
      "button:has-text(\"点击导出\")",
      "span:has-text(\"点击导出\")",
      "button:has-text(\"导出\")",
      "button:has-text(\"下载\")",
      "[class*=\"export\"]"
    ];
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        await locator.waitFor({ state: "visible", timeout: 3000 });
        return locator;
      } catch (_error) {
        legacyWarn("export selector miss", selector);
      }
    }
    throw new LegacyExportError("EXPORT_BUTTON_NOT_FOUND", "Could not locate legacy export button");
  }

  private async waitForExportTask(page: Page, taskId: string): Promise<ExportTask | null> {
    let completedWithoutUrlCount = 0;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5 * 60 * 1000) {
      const response = await page.waitForResponse(
        (candidate) => candidate.url().includes(`/sync/export/tasks/${taskId}`) && candidate.status() === 200,
        { timeout: 35000 }
      );
      const payload = await response.json().catch(() => null) as any;
      const task = (payload?.c || {}) as ExportTask;
      legacyLog("export task poll", {
        taskId,
        status: task.status,
        finished: task.finished,
        percent: task.result?.percent,
        hasAccessUrl: Boolean(task.access_url)
      });
        if (task.access_url) return task;
      if (task.result?.percent === 1) {
        completedWithoutUrlCount += 1;
        if (completedWithoutUrlCount >= 5) return null;
      } else {
        completedWithoutUrlCount = 0;
      }
      await page.waitForTimeout(3000);
    }
    throw new LegacyExportError("EXPORT_TASK_TIMEOUT", `Export task ${taskId} did not finish in time`);
  }

  private async readLatestTaskFromResponse(responsePromise: Promise<any> | null): Promise<ExportTask | null> {
    try {
      if (!responsePromise) return null;
      const response = await responsePromise;
      if (!response) return null;
      const payload = await response.json().catch(() => null) as any;
      const items = payload?.c?.items;
      if (!Array.isArray(items) || items.length === 0) {
        return null;
      }
      return items[0] as ExportTask;
    } catch (error) {
      legacyWarn("fetch latest export task failed", error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private async downloadLatestExport(page: Page): Promise<void> {
    const downloadPromise = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
    let clicked = false;
    for (const candidate of [page.getByText("下载文件", { exact: true }), page.locator(".download-tip").first()]) {
      try {
        await candidate.click({ timeout: 5000, force: true });
        clicked = true;
        break;
      } catch (_error) {
        legacyWarn("download latest export click miss");
      }
    }
    if (!clicked) {
      clicked = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll("*"));
        const target = nodes.find((node) => (node.textContent || "").trim() === "下载文件") as HTMLElement | undefined;
        if (!target) return false;
        target.click();
        return true;
      }).catch(() => false);
    }
    if (!clicked) {
      throw new LegacyExportError("ZIP_NOT_FOUND", "Could not click the latest export download control");
    }
    const download = await downloadPromise;
    if (!download) {
      throw new LegacyExportError("DOWNLOAD_TIMEOUT", "Download event did not fire from the latest export control");
    }
    await download.saveAs(LEGACY_DOWNLOAD_FILE);
  }

  private async downloadFromUrl(url: string, filePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const client = url.startsWith("https:") ? https : http;
      const request = client.get(url, (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new LegacyExportError("ZIP_NOT_FOUND", `Download URL returned ${response.statusCode}`));
          return;
        }
        const stream = fs.createWriteStream(filePath);
        response.pipe(stream);
        stream.on("finish", () => {
          stream.close();
          resolve();
        });
        stream.on("error", reject);
      });
      request.on("error", reject);
    });
  }

  private async verifyDownloadedZip(): Promise<void> {
    const stats = await fs.stat(LEGACY_DOWNLOAD_FILE).catch(() => null);
    if (!stats || stats.size <= 0) {
      throw new LegacyExportError("ZIP_INVALID", "Downloaded ZIP file is missing or empty");
    }
  }

  private taskTimeToIso(task: ExportTask | null | undefined): string | undefined {
    const candidate = task?.update_time || task?.create_time;
    if (!candidate) return undefined;
    const value = candidate > 1_000_000_000_000 ? candidate : candidate * 1000;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }
}
