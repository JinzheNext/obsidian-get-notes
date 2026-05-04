import { Plugin } from "obsidian";
import { formatSyncTime } from "../utils/time";

export class GetNotesStatusBar {
  private el = this.plugin.addStatusBarItem();

  constructor(private plugin: Plugin) {}

  setIdle(lastSyncAt?: string): void {
    this.el.setText(`Get Notes: Last sync ${formatSyncTime(lastSyncAt)}`);
  }

  setRunning(): void {
    this.el.setText("Get Notes: Syncing...");
  }

  setFailed(): void {
    this.el.setText("Get Notes: Sync failed");
  }
}
