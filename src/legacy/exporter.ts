import fs from "fs-extra";
import http from "http";
import https from "https";
import { Readable } from "stream";
import type { Locator, Page } from "playwright";
import { LEGACY_AUTH_FILE, LEGACY_DOWNLOAD_FILE, GET_EXPORT_CANDIDATE_URLS, LEGACY_PLAYWRIGHT_CACHE_LOC } from "./const";
import { cleanupLegacyCacheArtifacts } from "./cacheCleanup";
import { LegacyExportError } from "./errors";
import { legacyLog, legacyStageLog, legacyWarn } from "./logger";
import { encodeLegacyProgress } from "./progress";
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

const DOWNLOAD_PROGRESS_INTERVAL_MS = 1000;
const DOWNLOAD_STALL_TIMEOUT_MS = 20_000;
const MAX_DOWNLOAD_REDIRECTS = 5;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDownloadMessage(downloadedBytes: number, totalBytes?: number | null, speedBytesPerSec?: number): string {
  const base = totalBytes && totalBytes > 0
    ? `正在下载 ZIP：${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}（${((downloadedBytes / totalBytes) * 100).toFixed(1)}%）`
    : `正在下载 ZIP：已下载 ${formatBytes(downloadedBytes)}`;
  if (!speedBytesPerSec || speedBytesPerSec <= 0) return base;
  return `${base}，速度约 ${formatBytes(speedBytesPerSec)}/s`;
}

export class LegacyExporter {
  constructor(private pluginDir: string) {}

  async export(onProgress?: (stage: string) => void): Promise<LegacyExportResult> {
    await fs.mkdirp(LEGACY_PLAYWRIGHT_CACHE_LOC);
    await cleanupLegacyCacheArtifacts();
    if (!await fs.pathExists(LEGACY_AUTH_FILE)) {
      throw new LegacyExportError("LOGIN_REQUIRED", "Missing auth file");
    }
    await fs.remove(LEGACY_DOWNLOAD_FILE).catch(() => undefined);

    const playwright = loadPlaywright(this.pluginDir);
    onProgress?.(encodeLegacyProgress("opening_browser"));
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
      onProgress?.(encodeLegacyProgress("checking_login"));
      legacyStageLog("checking_login");
      await this.openExportPage(page);
      await page.waitForLoadState("load");
      await page.waitForTimeout(1500);
      const latestTask = await this.readLatestTaskFromResponse(latestResponsePromise);

      if (latestTask?.access_url && latestTask.status === "success") {
        legacyLog("reuse latest export task", latestTask);
        onProgress?.(encodeLegacyProgress("opening_export_page"));
        legacyStageLog("opening_export_page", {
          lastExportAt: this.taskTimeToIso(latestTask),
          status: latestTask.status,
        });
        try {
          onProgress?.(encodeLegacyProgress("downloading_zip", "正在等待浏览器开始下载 ZIP..."));
          legacyStageLog("downloading_zip");
          await this.downloadLatestExport(page, onProgress);
        } catch (downloadError) {
          legacyWarn("page download fallback failed, try latest task access_url", downloadError instanceof Error ? downloadError.message : String(downloadError));
          onProgress?.(encodeLegacyProgress("downloading_zip", "浏览器下载未触发，正在改用直链下载 ZIP..."));
          legacyStageLog("downloading_zip", { fallback: "access_url" });
          await this.downloadFromUrl(latestTask.access_url, LEGACY_DOWNLOAD_FILE, onProgress);
        }

        if (!await fs.pathExists(LEGACY_DOWNLOAD_FILE)) {
          throw new LegacyExportError("ZIP_NOT_FOUND", "Latest export download did not produce a ZIP file");
        }

        onProgress?.(encodeLegacyProgress("verifying_zip"));
        legacyStageLog("verifying_zip");
        await this.verifyDownloadedZip();
        await context.close();
        return {
          rawZipPath: LEGACY_DOWNLOAD_FILE,
          lastExportAt: this.taskTimeToIso(latestTask),
        };
      }

      const exportButton = await this.findExportButton(page);
      onProgress?.(encodeLegacyProgress("triggering_export"));
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
            onProgress?.(encodeLegacyProgress("downloading_zip", "导出任务未返回 task id，正在复用最近一次导出 ZIP..."));
            legacyStageLog("downloading_zip", { fallback: "latest_task_after_rate_limit" });
            await this.downloadLatestExport(page, onProgress);
          } catch (downloadError) {
            legacyWarn("page download fallback failed, try latest task access_url", downloadError instanceof Error ? downloadError.message : String(downloadError));
            onProgress?.(encodeLegacyProgress("downloading_zip", "浏览器下载未触发，正在改用直链下载最近一次导出 ZIP..."));
            legacyStageLog("downloading_zip", { fallback: "access_url_after_rate_limit" });
            await this.downloadFromUrl(latestTask.access_url, LEGACY_DOWNLOAD_FILE, onProgress);
          }
        } else {
          throw new LegacyExportError("DOWNLOAD_TIMEOUT", createPayload?.h?.e || "Export task id was not returned");
        }
      } else {
        onProgress?.(encodeLegacyProgress("waiting_for_export_task"));
        legacyStageLog("waiting_for_export_task", { taskId });
        const task = await this.waitForExportTask(page, taskId, onProgress);
        if (task?.access_url) {
          onProgress?.(encodeLegacyProgress("downloading_zip", "导出任务已完成，正在下载 ZIP..."));
          legacyStageLog("downloading_zip");
          await this.downloadFromUrl(task.access_url, LEGACY_DOWNLOAD_FILE, onProgress);
        } else {
          onProgress?.(encodeLegacyProgress("downloading_zip", "导出任务完成但未返回直链，正在尝试浏览器下载 ZIP..."));
          legacyStageLog("downloading_zip", { fallback: "download_control_after_task" });
          await this.downloadLatestExport(page, onProgress);
        }
      }
      if (!await fs.pathExists(LEGACY_DOWNLOAD_FILE)) {
        throw new LegacyExportError("ZIP_NOT_FOUND", "Download file missing after legacy download step");
      }

      onProgress?.(encodeLegacyProgress("verifying_zip"));
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

  private async waitForExportTask(page: Page, taskId: string, onProgress?: (stage: string) => void): Promise<ExportTask | null> {
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
      const percent = typeof task.result?.percent === "number" ? task.result.percent : null;
      if (percent !== null) {
        onProgress?.(encodeLegacyProgress("waiting_for_export_task", `正在等待导出任务完成：${(percent * 100).toFixed(1)}%`));
      }
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

  private async downloadLatestExport(page: Page, onProgress?: (stage: string) => void): Promise<void> {
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
    onProgress?.(encodeLegacyProgress("downloading_zip", "已点击下载，正在等待浏览器返回下载任务..."));
    const download = await downloadPromise;
    if (!download) {
      throw new LegacyExportError("DOWNLOAD_TIMEOUT", "Download event did not fire from the latest export control");
    }
    const suggestedName = download.suggestedFilename() || "get_export.zip";
    onProgress?.(encodeLegacyProgress("downloading_zip", `浏览器已开始下载：${suggestedName}`));

    const downloadUrl = download.url();
    if (downloadUrl) {
      onProgress?.(encodeLegacyProgress("downloading_zip", `已获取下载链接，正在接管下载进度：${suggestedName}`));
      await this.downloadFromUrl(downloadUrl, LEGACY_DOWNLOAD_FILE, onProgress);
      return;
    }

    onProgress?.(
      encodeLegacyProgress(
        "downloading_zip",
        `浏览器已开始下载，但当前无法读取实时字节进度：${suggestedName}`
      )
    );
    const readable = await download.createReadStream();
    if (!readable) {
      throw new LegacyExportError("DOWNLOAD_TIMEOUT", "Could not create readable stream for the browser download");
    }
    await this.writeReadableToFile(readable, LEGACY_DOWNLOAD_FILE, null, onProgress);
  }

  private async downloadFromUrl(url: string, filePath: string, onProgress?: (stage: string) => void): Promise<void> {
    await this.downloadFromUrlWithRedirects(url, filePath, onProgress, 0);
  }

  private async downloadFromUrlWithRedirects(
    url: string,
    filePath: string,
    onProgress: ((stage: string) => void) | undefined,
    redirectCount: number
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const client = url.startsWith("https:") ? https : http;
      const request = client.get(url, (response) => {
        const statusCode = response.statusCode || 0;
        const location = response.headers.location;
        if (location && statusCode >= 300 && statusCode < 400) {
          response.resume();
          if (redirectCount >= MAX_DOWNLOAD_REDIRECTS) {
            reject(new LegacyExportError("DOWNLOAD_TIMEOUT", `Too many download redirects for ${url}`));
            return;
          }
          const nextUrl = new URL(location, url).toString();
          this.downloadFromUrlWithRedirects(nextUrl, filePath, onProgress, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        if (statusCode >= 400) {
          reject(new LegacyExportError("ZIP_NOT_FOUND", `Download URL returned ${statusCode}`));
          return;
        }
        const totalBytes = Number.parseInt(String(response.headers["content-length"] || "0"), 10) || null;
        this.writeReadableToFile(response, filePath, totalBytes, onProgress).then(resolve).catch(reject);
      });
      request.on("error", reject);
    });
  }

  private async writeReadableToFile(
    readable: Readable,
    filePath: string,
    totalBytes: number | null,
    onProgress?: (stage: string) => void
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(filePath);
      let downloadedBytes = 0;
      let lastReportedBytes = 0;
      let lastProgressAt = Date.now();
      let closed = false;

      const clearTimers = (interval: NodeJS.Timeout): void => {
        clearInterval(interval);
      };

      const interval = setInterval(() => {
        const now = Date.now();
        const fileBytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
        if (fileBytes > downloadedBytes) {
          downloadedBytes = fileBytes;
        }
        if (downloadedBytes > lastReportedBytes) {
          const deltaBytes = downloadedBytes - lastReportedBytes;
          const elapsedSec = Math.max(1, (now - lastProgressAt) / 1000);
          const speed = deltaBytes / elapsedSec;
          lastReportedBytes = downloadedBytes;
          lastProgressAt = now;
          onProgress?.(encodeLegacyProgress("downloading_zip", formatDownloadMessage(downloadedBytes, totalBytes, speed)));
          return;
        }

        if (!closed && now - lastProgressAt > DOWNLOAD_STALL_TIMEOUT_MS) {
          clearTimers(interval);
          readable.destroy();
          stream.destroy();
          reject(new LegacyExportError("DOWNLOAD_STALLED", `No download progress for ${DOWNLOAD_STALL_TIMEOUT_MS / 1000}s`));
        }
      }, DOWNLOAD_PROGRESS_INTERVAL_MS);

      readable.on("data", (chunk: Buffer | string) => {
        downloadedBytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
      });
      readable.on("error", (error) => {
        clearTimers(interval);
        reject(error);
      });
      stream.on("error", (error) => {
        clearTimers(interval);
        reject(error);
      });
      stream.on("finish", () => {
        clearTimers(interval);
        closed = true;
        onProgress?.(encodeLegacyProgress("downloading_zip", formatDownloadMessage(downloadedBytes, totalBytes)));
        stream.close();
        resolve();
      });

      readable.pipe(stream);
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
