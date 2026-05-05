export const CATEGORY_MAP: Record<string, string> = {
  audio: "01 语音记录",
  local_audio: "01 语音记录",
  meeting: "02 多人会议",
  plain_text: "03 纯文本记录",
  text: "03 纯文本记录",
  link: "04 链接同步摘抄"
};

export const FALLBACK_CATEGORY = "99 其他";

export function resolveCategory(noteType?: string): string {
  return CATEGORY_MAP[noteType || ""] || FALLBACK_CATEGORY;
}

export const MANAGED_CATEGORY_FOLDERS = [
  "01 语音记录",
  "02 多人会议",
  "03 纯文本记录",
  "04 链接同步摘抄",
  "99 其他"
];
