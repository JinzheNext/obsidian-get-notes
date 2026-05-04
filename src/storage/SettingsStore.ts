import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, DEFAULT_SYNC_STATE, GetNotesPluginSettings, PluginDataShape } from "../types";

export class SettingsStore {
  constructor(private plugin: Plugin) {}

  async load(): Promise<GetNotesPluginSettings> {
    const data = (await this.plugin.loadData()) as Partial<PluginDataShape> | null;
    return {
      ...DEFAULT_SETTINGS,
      ...(data?.settings || {})
    };
  }

  async save(settings: GetNotesPluginSettings): Promise<void> {
    const data = ((await this.plugin.loadData()) as Partial<PluginDataShape> | null) || {};
    const merged: PluginDataShape = {
      settings,
      state: data.state || DEFAULT_SYNC_STATE
    };
    await this.plugin.saveData(merged);
  }
}
