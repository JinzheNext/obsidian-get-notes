import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, DEFAULT_SYNC_STATE, PluginDataShape, PluginSyncState } from "../types";

export class StateStore {
  constructor(private plugin: Plugin) {}

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
      settings: data.settings || DEFAULT_SETTINGS,
      state
    };
    await this.plugin.saveData(merged);
  }
}
