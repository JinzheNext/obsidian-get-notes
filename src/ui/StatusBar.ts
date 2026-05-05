import { Plugin } from "obsidian";
import { buildModeLabel } from "../sync/resultTypes";
import { formatSyncTime } from "../utils/time";
import { SyncMode } from "../types";

export class GetNotesStatusBar {
  private el = this.plugin.addStatusBarItem();

  constructor(private plugin: Plugin) {}

  setIdle(lastSyncAt?: string, mode: SyncMode = "openapi"): void {
    this.el.setText(`Get Notes（${buildModeLabel(mode)}）：最近同步 ${formatSyncTime(lastSyncAt)}`);
  }

  setRunning(mode: SyncMode = "openapi", stage?: string): void {
    this.el.setText(`Get Notes（${buildModeLabel(mode)}）：${stage || "同步中..."}`);
  }

  setFailed(mode: SyncMode = "openapi"): void {
    this.el.setText(`Get Notes（${buildModeLabel(mode)}）：同步失败`);
  }
}
