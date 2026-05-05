import { GetNoteSummary } from "../api/types";
import { PluginSyncState } from "../types";

export interface PlannedSync {
  added: GetNoteSummary[];
  updated: GetNoteSummary[];
  skipped: GetNoteSummary[];
}

function noteId(summary: GetNoteSummary): string {
  return String(summary.note_id ?? summary.id ?? summary.prime_id ?? "");
}

function updatedAt(summary: GetNoteSummary): string {
  return String(summary.updated_at || "");
}

export class SyncPlanner {
  plan(summaries: GetNoteSummary[], state: PluginSyncState): PlannedSync {
    const added: GetNoteSummary[] = [];
    const updated: GetNoteSummary[] = [];
    const skipped: GetNoteSummary[] = [];

    for (const summary of summaries) {
      const id = noteId(summary);
      if (!id) continue;
      const existing = state.notesByCanonicalId[`api:${id}`];
      if (!existing) {
        added.push(summary);
        continue;
      }
      if (String(existing.updatedAt || "") !== updatedAt(summary)) {
        updated.push(summary);
        continue;
      }
      skipped.push(summary);
    }

    return { added, updated, skipped };
  }
}
