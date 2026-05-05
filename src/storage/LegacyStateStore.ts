import { Plugin } from "obsidian";
import {
  DEFAULT_LEGACY_SYNC_STATE,
  DEFAULT_SETTINGS,
  DEFAULT_SYNC_STATE,
  LegacySyncState,
  PluginDataShape
} from "../types";

type PluginDataOwner = Plugin & {
  settings?: PluginDataShape["settings"];
  state?: PluginDataShape["state"];
  legacyState?: LegacySyncState;
};

export class LegacyStateStore {
  constructor(private plugin: PluginDataOwner) {}

  async load(): Promise<LegacySyncState> {
    const data = (await this.plugin.loadData()) as Partial<PluginDataShape> | null;
    return {
      ...DEFAULT_LEGACY_SYNC_STATE,
      ...(data?.legacyState || {}),
      syncedNoteIds: [...(data?.legacyState?.syncedNoteIds || DEFAULT_LEGACY_SYNC_STATE.syncedNoteIds)]
    };
  }

  async save(legacyState: LegacySyncState): Promise<void> {
    const data = ((await this.plugin.loadData()) as Partial<PluginDataShape> | null) || {};
    const merged: PluginDataShape = {
      settings: this.plugin.settings || data.settings || DEFAULT_SETTINGS,
      state: this.plugin.state || data.state || DEFAULT_SYNC_STATE,
      legacyState
    };
    await this.plugin.saveData(merged);
  }
}
