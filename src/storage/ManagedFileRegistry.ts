import { App, normalizePath } from "obsidian";
import { MANAGED_CATEGORY_FOLDERS } from "../render/CategoryResolver";
import { PluginSyncState } from "../types";
import { removePathIfExists } from "../utils/path";

export class ManagedFileRegistry {
  constructor(private app: App) {}

  async clearManagedContent(targetFolder: string, state?: PluginSyncState): Promise<void> {
    const normalizedRoot = normalizePath(targetFolder);
    const managedPaths = new Set<string>();

    for (const noteState of Object.values(state?.notesByCanonicalId || {})) {
      if (noteState.filePath) managedPaths.add(normalizePath(noteState.filePath));
      for (const assetPath of noteState.assetPaths.audios || []) {
        managedPaths.add(normalizePath(assetPath));
      }
      for (const assetPath of noteState.assetPaths.images || []) {
        managedPaths.add(normalizePath(assetPath));
      }
      for (const assetPath of noteState.assetPaths.files || []) {
        managedPaths.add(normalizePath(assetPath));
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
    await removePathIfExists(this.app, normalizePath(`${normalizedRoot}/_assets/images`));
    await removePathIfExists(this.app, normalizePath(`${normalizedRoot}/_assets/files`));
  }
}
