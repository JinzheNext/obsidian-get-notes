import { UnifiedSyncResult } from "../types";

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
  errorMessage?: string,
  outputFolder?: string
): UnifiedSyncResult {
  if (errorMessage) {
    return {
      mode: "openapi",
      startedAt,
      finishedAt,
      status: "failed",
      added: counters.added,
      updated: counters.updated,
      skipped: counters.skipped,
      failed: Math.max(1, counters.failed),
      total: counters.totalRemote,
      totalRemote: counters.totalRemote,
      outputFolder,
      errorMessage
    };
  }

  const hadFailures = counters.failed > 0;
  const hadAnySuccess = counters.added > 0 || counters.updated > 0 || counters.skipped > 0;
  const status = hadFailures ? (hadAnySuccess ? "partial_success" : "failed") : "success";

  return {
    mode: "openapi",
    startedAt,
    finishedAt,
    status,
    added: counters.added,
    updated: counters.updated,
    skipped: counters.skipped,
    failed: counters.failed,
    total: counters.totalRemote,
    totalRemote: counters.totalRemote,
    outputFolder,
    errorMessage
  };
}
