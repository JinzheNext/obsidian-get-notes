import { Plugin } from "obsidian";
import {
  DEFAULT_LEGACY_SYNC_STATE,
  DEFAULT_SETTINGS,
  DEFAULT_SYNC_STATE,
  PluginDataShape,
  PluginSyncState
} from "../types";

type PluginDataOwner = Plugin & {
  settings?: PluginDataShape["settings"];
  state?: PluginSyncState;
  legacyState?: PluginDataShape["legacyState"];
};

export class StateStore {
  constructor(private plugin: PluginDataOwner) {}

  async load(): Promise<PluginSyncState> {
    const data = (await this.plugin.loadData()) as Partial<PluginDataShape> | null;
    return {
      ...DEFAULT_SYNC_STATE,
      ...(data?.state || {}),
      notesById: {
        ...DEFAULT_SYNC_STATE.notesById,
        ...(data?.state?.notesById || {})
      }
    };
  }

  async save(state: PluginSyncState): Promise<void> {
    const data = ((await this.plugin.loadData()) as Partial<PluginDataShape> | null) || {};
    const merged: PluginDataShape = {
      settings: this.plugin.settings || data.settings || DEFAULT_SETTINGS,
      state,
      legacyState: this.plugin.legacyState || data.legacyState || DEFAULT_LEGACY_SYNC_STATE
    };
    await this.plugin.saveData(merged);
  }
}
