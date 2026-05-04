import { App, normalizePath } from "obsidian";
import { MANAGED_CATEGORY_FOLDERS } from "../render/CategoryResolver";
import { removePathIfExists } from "../utils/path";

export class ManagedFileRegistry {
  constructor(private app: App) {}

  async clearManagedContent(targetFolder: string): Promise<void> {
    const normalizedRoot = normalizePath(targetFolder);
    for (const category of MANAGED_CATEGORY_FOLDERS) {
      await removePathIfExists(this.app, normalizePath(`${normalizedRoot}/${category}`));
    }
    await removePathIfExists(this.app, normalizePath(`${normalizedRoot}/_assets/audio`));
  }
}
