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
}
