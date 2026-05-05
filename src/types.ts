export type SyncMode = "openapi" | "legacy";
export type SyncStatus = "success" | "partial_success" | "failed";
export type CanonicalNoteType = "audio" | "meeting" | "text" | "link" | "other";
export type CompletenessSource = "api" | "legacy" | "html" | "none";
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

export interface Asset {
  kind: "audio" | "image" | "file";
  source: string;
  title: string;
  ext?: string;
}

export interface CanonicalNote {
  canonicalId: string;
  sourceIds: {
    api?: string;
    legacy?: string;
  };
  title: string;
  type: CanonicalNoteType;
  createdAt: number | null;
  updatedAt: number | null;
  content: {
    summary: string | null;
    body: string | null;
    reference: string | null;
  };
  tags: string[];
  notebook: string | null;
  assets: {
    audios: Asset[];
    images: Asset[];
    files: Asset[];
    links: string[];
  };
  completeness: {
    summary: CompletenessSource;
    body: CompletenessSource;
    assets: CompletenessSource;
  };
  fingerprint: string;
}

export interface SyncStateEntry {
  canonicalId: string;
  filePath: string;
  fingerprint: string;
  deleted: boolean;
  lastSyncedAt: number;
  localSequence: number;
  stem: string;
  sourceIds: {
    api?: string;
    legacy?: string;
  };
  type: CanonicalNoteType;
  updatedAt: number | null;
  title: string;
  assetPaths: {
    audios: string[];
    images: string[];
    files: string[];
  };
}

export interface MigrationReport {
  matches: {
    canonicalId: string;
    apiPath?: string;
    legacyPath?: string;
    winner: "api" | "legacy";
    completenessDiff: string[];
  }[];
  conflicts: {
    reason: string;
    candidates: string[];
  }[];
  unmatched: string[];
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
  notesByCanonicalId: Record<string, SyncStateEntry>;
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
  schemaVersion: 2,
  nextLocalSequence: 1,
  notesByCanonicalId: {}
};

export const DEFAULT_LEGACY_SYNC_STATE: LegacySyncState = {
  schemaVersion: 1,
  syncedNoteIds: []
};
