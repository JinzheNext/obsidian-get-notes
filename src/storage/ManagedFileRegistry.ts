import { App, normalizePath } from "obsidian";
import { MANAGED_CATEGORY_FOLDERS } from "../render/CategoryResolver";
import { PluginSyncState } from "../types";
import { removePathIfExists } from "../utils/path";

export class ManagedFileRegistry {
  constructor(private app: App) {}

  async clearManagedContent(targetFolder: string, state?: PluginSyncState): Promise<void> {
    const normalizedRoot = normalizePath(targetFolder);
    const managedPaths = new Set<string>();

    for (const noteState of Object.values(state?.notesById || {})) {
      if (noteState.markdownPath) managedPaths.add(normalizePath(noteState.markdownPath));
      for (const duplicatePath of noteState.duplicateMarkdownPaths || []) {
        managedPaths.add(normalizePath(duplicatePath));
      }
      for (const audioPath of noteState.audioPaths || []) {
        managedPaths.add(normalizePath(audioPath));
      }
    }

    if (managedPaths.size > 0) {
      for (const filePath of managedPaths) {
        await removePathIfExists(this.app, filePath);
      }
      return;
    }

    for (const category of MANAGED_CATEGORY_FOLDERS) {
      await removePathIfExists(this.app, normalizePath(`${normalizedRoot}/${category}`));
    }
    await removePathIfExists(this.app, normalizePath(`${normalizedRoot}/_assets/audio`));
  }
}
