import { Plugin } from "obsidian";
import {
  DEFAULT_LEGACY_SYNC_STATE,
  DEFAULT_SETTINGS,
  DEFAULT_SYNC_STATE,
  GetNotesPluginSettings,
  PluginDataShape
} from "../types";

type PluginDataOwner = Plugin & {
  settings?: GetNotesPluginSettings;
  state?: PluginDataShape["state"];
  legacyState?: PluginDataShape["legacyState"];
};

export class SettingsStore {
  constructor(private plugin: PluginDataOwner) {}

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
      state: this.plugin.state || data.state || DEFAULT_SYNC_STATE,
      legacyState: this.plugin.legacyState || data.legacyState || DEFAULT_LEGACY_SYNC_STATE
    };
    await this.plugin.saveData(merged);
  }
}
