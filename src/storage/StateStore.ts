import { Plugin } from "obsidian";
import {
  DEFAULT_LEGACY_SYNC_STATE,
  DEFAULT_SETTINGS,
  DEFAULT_SYNC_STATE,
  PluginDataShape,
  PluginSyncState,
  SyncStateEntry
} from "../types";
import { normalizePath } from "obsidian";

type PluginDataOwner = Plugin & {
  settings?: PluginDataShape["settings"];
  state?: PluginSyncState;
  legacyState?: PluginDataShape["legacyState"];
};

type LegacyNoteStateShape = {
  noteId?: string;
  updatedAt?: string;
  title?: string;
  type?: string;
  localSequence?: number;
  stem?: string;
  markdownPath?: string;
  audioPaths?: string[];
  lastSyncedAt?: string;
  lastContentHash?: string;
};

export class StateStore {
  constructor(private plugin: PluginDataOwner) {}

  async load(): Promise<PluginSyncState> {
    const data = (await this.plugin.loadData()) as Partial<PluginDataShape> | null;
    const rawState = data?.state as (Partial<PluginSyncState> & {
      notesById?: Record<string, LegacyNoteStateShape>;
      notesByCanonicalId?: Record<string, SyncStateEntry>;
    }) | undefined;
    const migrated = this.migrate(rawState);
    return {
      ...DEFAULT_SYNC_STATE,
      ...migrated,
      notesByCanonicalId: {
        ...DEFAULT_SYNC_STATE.notesByCanonicalId,
        ...(migrated.notesByCanonicalId || {})
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

  private migrate(
    state:
      | (Partial<PluginSyncState> & {
          notesById?: Record<string, LegacyNoteStateShape>;
          notesByCanonicalId?: Record<string, SyncStateEntry>;
        })
      | undefined
  ): PluginSyncState {
    if (state?.schemaVersion === 2 && state.notesByCanonicalId) {
      return {
        ...DEFAULT_SYNC_STATE,
        ...state,
        notesByCanonicalId: state.notesByCanonicalId
      };
    }

    const migratedEntries: Record<string, SyncStateEntry> = {};
    for (const [noteId, legacyEntry] of Object.entries(state?.notesById || {})) {
      const canonicalId = `api:${noteId}`;
      const localSequence = Number.isFinite(legacyEntry.localSequence) ? Number(legacyEntry.localSequence) : 0;
      migratedEntries[canonicalId] = {
        canonicalId,
        filePath: normalizePath(legacyEntry.markdownPath || ""),
        fingerprint: legacyEntry.lastContentHash || "",
        deleted: false,
        lastSyncedAt: legacyEntry.lastSyncedAt ? Date.parse(legacyEntry.lastSyncedAt) || Date.now() : Date.now(),
        localSequence,
        stem: legacyEntry.stem || "",
        sourceIds: { api: noteId },
        type: this.normalizeLegacyType(legacyEntry.type),
        updatedAt: legacyEntry.updatedAt ? Date.parse(legacyEntry.updatedAt) || null : null,
        title: legacyEntry.title || legacyEntry.stem || noteId,
        assetPaths: {
          audios: [...(legacyEntry.audioPaths || [])].map((value) => normalizePath(value)),
          images: [],
          files: []
        }
      };
    }

    const nextLocalSequence =
      state?.nextLocalSequence ||
      Object.values(migratedEntries).reduce((max, entry) => Math.max(max, entry.localSequence), 0) + 1;

    return {
      schemaVersion: 2,
      lastSyncAt: state?.lastSyncAt,
      nextLocalSequence,
      notesByCanonicalId: migratedEntries,
      lastSyncSummary: state?.lastSyncSummary
    };
  }

  private normalizeLegacyType(type?: string): SyncStateEntry["type"] {
    switch (type) {
      case "audio":
      case "local_audio":
        return "audio";
      case "meeting":
        return "meeting";
      case "plain_text":
      case "text":
        return "text";
      case "link":
        return "link";
      default:
        return "other";
    }
  }
}
