export interface GetNotesPluginSettings {
  apiKey: string;
  clientId: string;
  targetFolder: string;
  autoSyncOnStartup: boolean;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  downloadAudio: boolean;
  showRibbonIcon: boolean;
}

export interface NoteSyncState {
  noteId: string;
  updatedAt: string;
  createdAt?: string;
  title: string;
  type: string;
  category: string;
  localSequence: number;
  stem: string;
  markdownPath: string;
  audioPaths: string[];
  rawCacheKey: string;
  lastSyncedAt: string;
  lastContentHash?: string;
  lastError?: string;
}

export interface LastSyncSummary {
  startedAt: string;
  finishedAt: string;
  status: "success" | "partial_success" | "failed";
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  totalRemote: number;
  errorMessage?: string;
}

export interface PluginSyncState {
  schemaVersion: number;
  lastSyncAt?: string;
  nextLocalSequence: number;
  notesById: Record<string, NoteSyncState>;
  lastSyncSummary?: LastSyncSummary;
}

export interface PluginDataShape {
  settings: GetNotesPluginSettings;
  state: PluginSyncState;
}

export const DEFAULT_SETTINGS: GetNotesPluginSettings = {
  apiKey: "",
  clientId: "",
  targetFolder: "00_Inbox/020 GetNotes",
  autoSyncOnStartup: true,
  autoSyncEnabled: true,
  syncIntervalMinutes: 30,
  downloadAudio: true,
  showRibbonIcon: true
};

export const DEFAULT_SYNC_STATE: PluginSyncState = {
  schemaVersion: 1,
  nextLocalSequence: 1,
  notesById: {}
};
