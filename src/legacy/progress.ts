import { LegacySyncStage } from "../types";

export const LEGACY_STAGE_MESSAGES: Record<LegacySyncStage, string> = {
  idle: "普通登录模式空闲中",
  starting: "正在启动普通登录同步...",
  opening_browser: "正在打开浏览器...",
  checking_login: "正在检查 Get 登录状态...",
  waiting_for_login: "请在浏览器中完成 Get 登录...",
  opening_export_page: "正在进入导出页面...",
  finding_export_button: "正在寻找导出入口...",
  triggering_export: "正在请求新的导出任务...",
  waiting_for_export_task: "正在等待导出任务完成...",
  downloading_zip: "正在下载 ZIP（全量导出，可能需要几分钟）...",
  verifying_zip: "正在校验导出文件...",
  parsing_zip: "正在解析导出包...",
  rendering_markdown: "正在整理并渲染 Markdown...",
  writing_files: "正在写入 Obsidian 文件...",
  completed: "普通登录模式同步完成。",
  failed: "普通登录模式同步失败。"
};

export interface LegacyStageEvent {
  stage: LegacySyncStage;
  message: string;
  timestamp: string;
  detail?: Record<string, unknown>;
}

export function legacyStageMessage(stage: LegacySyncStage): string {
  return LEGACY_STAGE_MESSAGES[stage];
}
