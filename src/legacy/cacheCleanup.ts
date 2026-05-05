import fs from "fs-extra";
import path from "path";
import { LEGACY_CACHE_LOC, LEGACY_DOWNLOAD_FILE, LEGACY_SCREENSHOT_FILE } from "./const";
import { legacyLog, legacyWarn } from "./logger";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STALE_TMP_DIR_AGE_MS = ONE_DAY_MS;
const STALE_SCREENSHOT_AGE_MS = 7 * ONE_DAY_MS;
const STALE_ZIP_AGE_MS = 14 * ONE_DAY_MS;

async function removeIfStale(targetPath: string, maxAgeMs: number): Promise<void> {
  const stats = await fs.stat(targetPath).catch(() => null);
  if (!stats) return;
  const ageMs = Date.now() - stats.mtimeMs;
  if (ageMs < maxAgeMs) return;
  await fs.remove(targetPath).catch((error) => {
    legacyWarn("legacy cache cleanup remove failed", {
      targetPath,
      error: error instanceof Error ? error.message : String(error)
    });
  });
}

export async function cleanupLegacyCacheArtifacts(): Promise<void> {
  await fs.mkdirp(LEGACY_CACHE_LOC);
  const entries = await fs.readdir(LEGACY_CACHE_LOC).catch(() => []);
  for (const entry of entries) {
    if (!entry.startsWith("data-")) continue;
    const targetPath = path.join(LEGACY_CACHE_LOC, entry);
    const stats = await fs.stat(targetPath).catch(() => null);
    if (!stats?.isDirectory()) continue;
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs < STALE_TMP_DIR_AGE_MS) continue;
    await fs.remove(targetPath).catch((error) => {
      legacyWarn("legacy cache cleanup tmp dir failed", {
        targetPath,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  await removeIfStale(LEGACY_SCREENSHOT_FILE, STALE_SCREENSHOT_AGE_MS);
  await removeIfStale(LEGACY_DOWNLOAD_FILE, STALE_ZIP_AGE_MS);
  legacyLog("legacy cache cleanup complete");
}

