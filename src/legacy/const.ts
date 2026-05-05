import os from "os";
import path from "path";

export const LEGACY_CACHE_LOC = path.join(os.homedir(), ".get/cache/");
export const LEGACY_PLAYWRIGHT_CACHE_LOC = path.join(os.homedir(), ".get/cache/playwright/");
export const LEGACY_AUTH_FILE = path.join(LEGACY_PLAYWRIGHT_CACHE_LOC, "get_auth.json");
export const LEGACY_DOWNLOAD_FILE = path.join(LEGACY_PLAYWRIGHT_CACHE_LOC, "get_export.zip");

export const GET_LOGIN_URL = "https://www.biji.com/";
export const GET_EXPORT_CANDIDATE_URLS = [
  "https://www.biji.com/syncNote",
  "https://www.biji.com/note",
  "https://www.biji.com/"
];
