import { App, normalizePath } from "obsidian";
import { buildStem } from "../render/FileNameBuilder";
import { resolveCategory } from "../render/CategoryResolver";
import { CanonicalNote, PluginSyncState, SyncStateEntry } from "../types";
import { normalizeMatchTitle, normalizeText } from "./common";

export interface PreparedCanonicalWrite {
  canonicalId: string;
  existingKey?: string;
  existingEntry?: SyncStateEntry;
  localSequence: number;
  stem: string;
  filePath: string;
  skipReason?: "deleted" | "missing-file" | "unchanged";
}

export interface CanonicalWritePolicy {
  restoreMissingFiles?: boolean;
}

function buildStableIdSuffix(note: CanonicalNote): string {
  return note.sourceIds.api || note.sourceIds.legacy || note.fingerprint.slice(0, 12);
}

function exactTitleTimeMatch(note: CanonicalNote, entry: SyncStateEntry): boolean {
  if (normalizeMatchTitle(note.title) !== normalizeMatchTitle(entry.title)) return false;
  if (!note.updatedAt || !entry.updatedAt) return false;
  return Math.abs(note.updatedAt - entry.updatedAt) < 5 * 60 * 1000;
}

function matchExistingState(note: CanonicalNote, state: PluginSyncState): { key: string; entry: SyncStateEntry } | null {
  const direct = state.notesByCanonicalId[note.canonicalId];
  if (direct) return { key: note.canonicalId, entry: direct };

  for (const [key, entry] of Object.entries(state.notesByCanonicalId)) {
    if (note.sourceIds.api && entry.sourceIds.api === note.sourceIds.api) return { key, entry };
    if (note.sourceIds.legacy && entry.sourceIds.legacy === note.sourceIds.legacy) return { key, entry };
  }

  for (const [key, entry] of Object.entries(state.notesByCanonicalId)) {
    if (exactTitleTimeMatch(note, entry)) return { key, entry };
  }

  return null;
}

function finalCanonicalId(note: CanonicalNote, matched: { key: string; entry: SyncStateEntry } | null): string {
  if (note.sourceIds.api) return `api:${note.sourceIds.api}`;
  if (matched?.entry.sourceIds.api) return `api:${matched.entry.sourceIds.api}`;
  if (note.sourceIds.legacy) return `legacy:${note.sourceIds.legacy}`;
  return matched?.key || note.canonicalId;
}

export async function prepareCanonicalWrite(
  app: App,
  state: PluginSyncState,
  note: CanonicalNote,
  targetFolder: string,
  policy: CanonicalWritePolicy = {}
): Promise<PreparedCanonicalWrite> {
  const matched = matchExistingState(note, state);
  const canonicalId = finalCanonicalId(note, matched);
  const existingEntry = state.notesByCanonicalId[canonicalId] || matched?.entry;
  const existingKey = state.notesByCanonicalId[canonicalId] ? canonicalId : matched?.key;

  if (existingEntry?.deleted) {
    return {
      canonicalId,
      existingKey,
      existingEntry,
      localSequence: existingEntry.localSequence,
      stem: existingEntry.stem,
      filePath: existingEntry.filePath,
      skipReason: "deleted"
    };
  }

  if (existingEntry?.filePath && !(await app.vault.adapter.exists(normalizePath(existingEntry.filePath)))) {
    if (policy.restoreMissingFiles) {
      return {
        canonicalId,
        existingKey,
        existingEntry,
        localSequence: existingEntry.localSequence,
        stem: existingEntry.stem,
        filePath: existingEntry.filePath
      };
    }
    existingEntry.deleted = true;
    return {
      canonicalId,
      existingKey,
      existingEntry,
      localSequence: existingEntry.localSequence,
      stem: existingEntry.stem,
      filePath: existingEntry.filePath,
      skipReason: "missing-file"
    };
  }

  if (existingEntry?.fingerprint && existingEntry.fingerprint === note.fingerprint) {
    return {
      canonicalId,
      existingKey,
      existingEntry,
      localSequence: existingEntry.localSequence,
      stem: existingEntry.stem,
      filePath: existingEntry.filePath,
      skipReason: "unchanged"
    };
  }

  const localSequence = existingEntry?.localSequence ?? state.nextLocalSequence;
  const stem = existingEntry?.stem || buildStem(localSequence, note.title, buildStableIdSuffix(note));
  const filePath = existingEntry?.filePath || normalizePath(`${targetFolder}/${resolveCategory(note.type)}/${stem}.md`);

  if (!existingEntry) {
    state.nextLocalSequence += 1;
  }

  return {
    canonicalId,
    existingKey,
    existingEntry,
    localSequence,
    stem,
    filePath
  };
}

export function commitCanonicalWrite(
  state: PluginSyncState,
  note: CanonicalNote,
  prepared: PreparedCanonicalWrite,
  assetPaths: SyncStateEntry["assetPaths"]
): void {
  if (prepared.existingKey && prepared.existingKey !== prepared.canonicalId) {
    delete state.notesByCanonicalId[prepared.existingKey];
  }

  state.notesByCanonicalId[prepared.canonicalId] = {
    canonicalId: prepared.canonicalId,
    filePath: prepared.filePath,
    fingerprint: note.fingerprint,
    deleted: false,
    lastSyncedAt: Date.now(),
    localSequence: prepared.localSequence,
    stem: prepared.stem,
    sourceIds: {
      api: note.sourceIds.api || prepared.existingEntry?.sourceIds.api,
      legacy: note.sourceIds.legacy || prepared.existingEntry?.sourceIds.legacy
    },
    type: note.type,
    updatedAt: note.updatedAt,
    title: note.title,
    assetPaths
  };
}
