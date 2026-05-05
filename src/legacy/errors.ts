export type LegacyExportErrorType =
  | "LOGIN_REQUIRED"
  | "LOGIN_FAILED"
  | "LOGIN_TIMEOUT"
  | "EXPORT_PAGE_NOT_FOUND"
  | "EXPORT_BUTTON_NOT_FOUND"
  | "EXPORT_TASK_TIMEOUT"
  | "DOWNLOAD_TIMEOUT"
  | "DOWNLOAD_STALLED"
  | "ZIP_NOT_FOUND"
  | "ZIP_INVALID"
  | "PARSE_FAILED"
  | "VAULT_WRITE_FAILED"
  | "UNKNOWN";

export class LegacyExportError extends Error {
  readonly type: LegacyExportErrorType;

  constructor(type: LegacyExportErrorType, message: string) {
    super(message);
    this.type = type;
    this.name = "LegacyExportError";
  }
}

export function toLegacyUserMessage(error: unknown): string {
  if (error instanceof LegacyExportError) {
    switch (error.type) {
      case "LOGIN_REQUIRED":
        return "普通登录模式失败：需要先完成网页登录，请在打开的浏览器窗口中完成登录。";
      case "LOGIN_FAILED":
        return "普通登录模式失败：登录未成功完成。";
      case "LOGIN_TIMEOUT":
        return "普通登录模式失败：等待登录超时，请在打开的浏览器中重新完成登录。";
      case "EXPORT_PAGE_NOT_FOUND":
        return "普通登录模式失败：未找到导出页面，Get 网页结构可能已经变化。";
      case "EXPORT_BUTTON_NOT_FOUND":
        return "普通登录模式失败：未找到导出按钮，Get 网页结构可能已经变化。";
      case "EXPORT_TASK_TIMEOUT":
        return "普通登录模式失败：等待导出任务完成超时，请稍后重试或先在 Get 网页里手动检查。";
      case "DOWNLOAD_TIMEOUT":
        return "普通登录模式失败：下载超时，请稍后重试。";
      case "DOWNLOAD_STALLED":
        return "普通登录模式失败：下载长时间没有进展，请检查网络、磁盘空间或稍后重试。";
      case "ZIP_NOT_FOUND":
        return "普通登录模式失败：未找到导出的 ZIP 文件。";
      case "ZIP_INVALID":
        return "普通登录模式失败：导出的 ZIP 文件无效或未下载完整。";
      case "PARSE_FAILED":
        return "普通登录模式失败：导出数据无法解析。";
      case "VAULT_WRITE_FAILED":
        return "普通登录模式失败：无法把 Markdown 写入你的 Obsidian 库。";
      default:
        return `普通登录模式失败：${error.message}`;
    }
  }

  if (error instanceof Error) {
    return `普通登录模式失败：${error.message}`;
  }

  return `普通登录模式失败：${String(error)}`;
}
