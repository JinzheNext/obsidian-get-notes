import { normalizePath } from "obsidian";
import { SyncMode } from "../types";

export const MODE_OUTPUT_FOLDERS = {
  openapi: "API 模式",
  legacy: "普通登录模式"
} as const;

export function resolveModeTargetFolder(baseTargetFolder: string, mode: SyncMode): string {
  const suffix = MODE_OUTPUT_FOLDERS[mode];
  return normalizePath(`${baseTargetFolder}/${suffix}`);
}
