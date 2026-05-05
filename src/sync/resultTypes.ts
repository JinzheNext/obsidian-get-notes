import { SyncMode, SyncStatus, UnifiedSyncResult } from "../types";
import { nowIso } from "../utils/time";

export function createUnifiedResult(input: Partial<UnifiedSyncResult> & Pick<UnifiedSyncResult, "mode" | "status">): UnifiedSyncResult {
  const startedAt = input.startedAt || nowIso();
  const finishedAt = input.finishedAt || nowIso();
  return {
    mode: input.mode,
    status: input.status,
    startedAt,
    finishedAt,
    stage: input.stage,
    added: input.added,
    updated: input.updated,
    skipped: input.skipped,
    failed: input.failed,
    total: input.total,
    totalRemote: input.totalRemote,
    outputFolder: input.outputFolder,
    message: input.message,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    warnings: input.warnings
  };
}

export function summarizeNotice(result: UnifiedSyncResult): string {
  if (result.mode === "legacy") {
    if (result.status === "success") {
      return `普通登录模式同步完成：已导入 ${result.total ?? result.added ?? 0} 条笔记。`;
    }
    return result.errorMessage || "普通登录模式同步失败。";
  }

  if (result.status === "success" || result.status === "partial_success") {
    return `API 模式同步完成：新增 ${result.added ?? 0}，更新 ${result.updated ?? 0}，跳过 ${result.skipped ?? 0}，失败 ${result.failed ?? 0}。`;
  }
  return result.errorMessage || "API 模式同步失败。";
}

export function buildModeLabel(mode: SyncMode): string {
  return mode === "openapi" ? "API 模式" : "普通登录模式";
}
