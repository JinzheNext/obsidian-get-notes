import { App, normalizePath } from "obsidian";
import { RawNoteRecord } from "../api/types";

export class RawCacheStore {
  private rootDir: string;

  constructor(private app: App, private pluginId: string) {
    this.rootDir = normalizePath(`${this.app.vault.configDir}/plugins/${pluginId}/raw-cache`);
  }

  private filePath(noteId: string): string {
    return normalizePath(`${this.rootDir}/${noteId}.json`);
  }

  async ensureRoot(): Promise<void> {
    if (!(await this.app.vault.adapter.exists(this.rootDir))) {
      await this.app.vault.adapter.mkdir(this.rootDir);
    }
  }

  async write(noteId: string, payload: RawNoteRecord): Promise<string> {
    await this.ensureRoot();
    const key = `${noteId}.json`;
    await this.app.vault.adapter.write(this.filePath(noteId), JSON.stringify(payload, null, 2));
    return key;
  }

  async read(noteId: string): Promise<RawNoteRecord | null> {
    const target = this.filePath(noteId);
    if (!(await this.app.vault.adapter.exists(target))) return null;
    const text = await this.app.vault.adapter.read(target);
    return JSON.parse(text) as RawNoteRecord;
  }

  async readAll(): Promise<Array<{ noteId: string; payload: RawNoteRecord }>> {
    if (!(await this.app.vault.adapter.exists(this.rootDir))) return [];
    const listing = await this.app.vault.adapter.list(this.rootDir).catch(() => null);
    if (!listing) return [];

    const results: Array<{ noteId: string; payload: RawNoteRecord }> = [];
    for (const filePath of listing.files) {
      if (!filePath.endsWith(".json")) continue;
      const noteId = filePath.split("/").pop()?.replace(/\.json$/, "") || "";
      if (!noteId) continue;
      const text = await this.app.vault.adapter.read(filePath).catch(() => "");
      if (!text) continue;
      try {
        results.push({
          noteId,
          payload: JSON.parse(text) as RawNoteRecord
        });
      } catch (_error) {
        continue;
      }
    }
    return results;
  }
}
