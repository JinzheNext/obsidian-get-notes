import { sanitizeFileName } from "../utils/sanitize";

export type LegacyAttachmentType = "audio" | "image" | "file" | "link";
export type LegacyNoteKind = "audio" | "meeting" | "plain_text" | "link";

export interface LegacyAttachmentRef {
  source: string;
  type: LegacyAttachmentType;
  title?: string;
  url?: string;
}

export interface LegacyNoteModel {
  id: string;
  title: string;
  date: string;
  dateTime: string;
  tags: string[];
  bodyMarkdown: string;
  attachments: LegacyAttachmentRef[];
  noteKind: LegacyNoteKind;
  externalLinks: Array<{ title: string; url: string }>;
}

function yamlScalar(value: unknown): string {
  return JSON.stringify(value ?? "");
}

function displayType(noteKind: LegacyNoteKind): string {
  switch (noteKind) {
    case "meeting":
      return "录音会议";
    case "audio":
      return "录音笔记";
    case "link":
      return "链接摘抄";
    default:
      return "纯文本笔记";
  }
}

export function inferLegacyNoteKind(note: LegacyNoteModel): LegacyNoteKind {
  const text = `${note.title}\n${note.bodyMarkdown}`;
  const audioCount = note.attachments.filter((item) => item.type === "audio").length;
  const hasExternalLink = note.externalLinks.some((item) => /^https?:\/\//.test(item.url));
  const peopleMatch = text.match(/参与人数[：:]\s*约?\s*(\d+)/);
  const peopleCount = peopleMatch ? Number.parseInt(peopleMatch[1], 10) : 0;
  const looksLikeMeeting = /####\s*会议信息|会议总结|多人|讨论|参会|会议/.test(text) || peopleCount >= 2;
  if (looksLikeMeeting && audioCount > 0) return "meeting";
  if (audioCount > 0) return "audio";
  if (hasExternalLink) return "link";
  return "plain_text";
}

export function buildLegacyStem(note: LegacyNoteModel): string {
  return `${sanitizeFileName(note.title)}-${note.id}`.slice(0, 160);
}

export function renderLegacyMarkdown(note: LegacyNoteModel, stem: string, attachmentLinks: string[]): string {
  const audioLinks = attachmentLinks.filter((link) => /\.(mp3|m4a|wav|aac|amr)$/i.test(link));
  const otherLinks = attachmentLinks.filter((link) => !audioLinks.includes(link));
  const tags = note.tags.length ? note.tags.map((tag) => `#${tag}`).join(" ") : "无";
  const originalRefs = note.externalLinks.length
    ? note.externalLinks.map((item) => `- 标题: ${item.title || "未命名链接"}\n- URL: ${item.url}`).join("\n")
    : "";
  const summaryLike = note.bodyMarkdown.trim();
  const lacksOriginalContent = note.noteKind === "audio" || note.noteKind === "meeting";
  const missingContentMessage =
    "_普通登录模式导出的数据中暂未包含完整原文内容。建议使用 API 模式获取更完整的转写内容。_";

  const sections = [
    "---",
    `title: ${yamlScalar(note.title)}`,
    `note_id: ${yamlScalar(note.id)}`,
    `type: ${yamlScalar(displayType(note.noteKind))}`,
    `note_type: ${yamlScalar(note.noteKind)}`,
    `source: ${yamlScalar("legacy_export")}`,
    `entry_type: ${yamlScalar("legacy_export")}`,
    `created_at: ${yamlScalar(note.dateTime)}`,
    `updated_at: ${yamlScalar(note.dateTime)}`,
    "children_count: 0",
    "tags:",
    ...(note.tags.length ? note.tags.map((tag) => `  - ${yamlScalar(tag)}`) : ["  []"]),
    "topics:",
    "  []",
    "---",
    `# ${note.title}`,
    "",
    "## 概览",
    "",
    `- 类型: ${displayType(note.noteKind)}`,
    "- 来源: legacy_export",
    "- 入口类型: legacy_export",
    `- 创建时间: ${note.dateTime}`,
    `- 更新时间: ${note.dateTime}`,
    "- 子笔记数: 0",
    `- 附件数: ${note.attachments.filter((item) => item.type !== "link").length}`,
    `- 本地音频数: ${audioLinks.length}`,
    "",
    "## 标签与归档",
    "",
    `- 标签: ${tags}`,
    "- 知识库: 无",
    "",
  ];

  if (summaryLike) {
    if (lacksOriginalContent) {
      sections.push("## 智能总结", "", summaryLike, "");
      sections.push("## 笔记内容", "", missingContentMessage, "");
    } else {
      sections.push("## 笔记内容", "", summaryLike, "");
    }
  }
  if (originalRefs) {
    sections.push("## 原始引用", "", originalRefs, "");
  }
  sections.push("## 附件", "");
  if (!attachmentLinks.length) {
    sections.push("无", "");
  } else {
    for (const link of audioLinks) sections.push(`- 音频文件: ![[${link}]]`);
    for (const link of otherLinks) sections.push(`- 附件文件: ![[${link}]]`);
    sections.push("");
  }

  return sections.join("\n").trim() + "\n";
}
