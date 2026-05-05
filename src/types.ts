export type SyncMode = "openapi" | "legacy";
export type SyncStatus = "success" | "partial_success" | "failed";
export type LegacySyncStage =
  | "idle"
  | "starting"
  | "opening_browser"
  | "checking_login"
  | "waiting_for_login"
  | "opening_export_page"
  | "finding_export_button"
  | "triggering_export"
  | "waiting_for_export_task"
  | "downloading_zip"
  | "verifying_zip"
  | "parsing_zip"
  | "rendering_markdown"
  | "writing_files"
  | "completed"
  | "failed";

export interface GetNotesPluginSettings {
  syncMode: SyncMode;
  apiKey: string;
  clientId: string;
  targetFolder: string;
  autoSyncOnStartup: boolean;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  downloadAudio: boolean;
  showRibbonIcon: boolean;
  legacyBrowserProfilePath?: string;
  legacyDownloadDir?: string;
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
  duplicateMarkdownPaths?: string[];
  audioPaths: string[];
  rawCacheKey: string;
  lastSyncedAt: string;
  lastContentHash?: string;
  lastError?: string;
}

export interface UnifiedSyncResult {
  mode: SyncMode;
  startedAt: string;
  finishedAt: string;
  status: SyncStatus;
  stage?: string;
  added?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  total?: number;
  totalRemote?: number;
  outputFolder?: string;
  message?: string;
  errorCode?: string;
  errorMessage?: string;
  warnings?: string[];
}

export interface PluginSyncState {
  schemaVersion: number;
  lastSyncAt?: string;
  nextLocalSequence: number;
  notesById: Record<string, NoteSyncState>;
  lastSyncSummary?: UnifiedSyncResult;
}

export interface LegacySyncState {
  schemaVersion: number;
  syncedNoteIds: string[];
  lastSyncAt?: string;
  lastExportAt?: string;
  lastLoginAt?: string;
  lastStage?: LegacySyncStage;
}

export interface PluginDataShape {
  settings: GetNotesPluginSettings;
  state: PluginSyncState;
  legacyState: LegacySyncState;
}

export const DEFAULT_SETTINGS: GetNotesPluginSettings = {
  syncMode: "openapi",
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

export const DEFAULT_LEGACY_SYNC_STATE: LegacySyncState = {
  schemaVersion: 1,
  syncedNoteIds: []
};
