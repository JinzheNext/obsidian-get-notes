import { LastSyncSummary } from "../types";

export interface SyncCounters {
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  totalRemote: number;
}

export function toLastSyncSummary(
  counters: SyncCounters,
  startedAt: string,
  finishedAt: string,
  errorMessage?: string
): LastSyncSummary {
  const hadFailures = counters.failed > 0;
  const hadAnySuccess = counters.added > 0 || counters.updated > 0 || counters.skipped > 0;
  const status = hadFailures ? (hadAnySuccess ? "partial_success" : "failed") : "success";

  return {
    startedAt,
    finishedAt,
    status,
    added: counters.added,
    updated: counters.updated,
    skipped: counters.skipped,
    failed: counters.failed,
    totalRemote: counters.totalRemote,
    errorMessage
  };
}
