import { GetNoteDetail, GetNoteSummary, RawNoteRecord } from "../api/types";
import { isSubstantiallySameText } from "./TextCompare";
import { renderFrontmatter } from "./FrontmatterRenderer";

function normalizeText(value: unknown): string {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function hasSmartSummary(detail: GetNoteDetail | null): boolean {
  const text = normalizeText(detail?.content);
  return text.startsWith("### 📑 智能总结") || text.includes("### ✨ 金句精选") || text.includes("### 📋 待办事项");
}

function summaryMarkdown(record: RawNoteRecord): string {
  const candidate = normalizeText(record.summary.content || record.detail?.content);
  if (!candidate) return "";
  if (candidate.startsWith("### 📑 智能总结")) {
    return candidate.replace(/^###\s+📑\s+智能总结\s*\n*/u, "").trim();
  }
  return candidate;
}

function bodyMarkdown(detail: GetNoteDetail | null): string {
  const transcript = normalizeText(detail?.audio?.original);
  const content = normalizeText(detail?.content);
  if (transcript) return transcript;
  if (!hasSmartSummary(detail) && content) return content;
  return "";
}

function unavailableContentMessage(noteType: string | undefined): string {
  if (noteType === "audio" || noteType === "local_audio" || noteType === "meeting") {
    return "_当前 API 数据中暂未提供完整原文转写内容。_";
  }
  return "_当前 API 数据中暂未提供可单独渲染的原文内容。_";
}

function originalReference(detail: GetNoteDetail | null): string {
  const attachments = Array.isArray(detail?.attachments) ? detail?.attachments : [];
  const linkAttachment = attachments.find((item) => item?.type === "link" && item?.url);
  const refContent = normalizeText(detail?.ref_content);
  if (!linkAttachment && !refContent) return "";

  const lines: string[] = [];
  if (linkAttachment) {
    lines.push(`- 标题: ${linkAttachment.title || "未命名链接"}`);
    lines.push(`- URL: ${linkAttachment.url}`);
  }
  if (refContent) {
    lines.push("");
    lines.push(refContent);
  }
  return lines.join("\n").trim();
}

function buildOverview(detail: GetNoteDetail | null, summary: GetNoteSummary, audioLinks: string[]): string {
  const attachments = Array.isArray(detail?.attachments) ? detail.attachments : [];
  const lines = [
    "## 概览",
    "",
    `- 类型: ${detail?.note_type || summary.note_type || "未知"}`,
    `- 来源: ${detail?.source || summary.source || "未知"}`,
    `- 入口类型: ${detail?.entry_type || "未知"}`,
    `- 创建时间: ${detail?.created_at || summary.created_at || "未知"}`,
    `- 更新时间: ${detail?.updated_at || summary.updated_at || "未知"}`,
    `- 子笔记数: ${detail?.children_count ?? 0}`
  ];
  if (attachments.length) lines.push(`- 附件数: ${attachments.length}`);
  if (audioLinks.length) lines.push(`- 本地音频数: ${audioLinks.length}`);
  return lines.join("\n");
}

function buildTagSection(detail: GetNoteDetail | null): string {
  const tags = Array.isArray(detail?.tags) ? detail.tags : [];
  const topics = Array.isArray(detail?.topics) ? detail.topics : [];
  return [
    "## 标签与归档",
    "",
    `- 标签: ${tags.length ? tags.map((tag) => `#${tag.name}`).join(" ") : "无"}`,
    `- 知识库: ${topics.length ? topics.map((topic) => topic.name || topic.topic_id || topic.id).join(" / ") : "无"}`
  ].join("\n");
}

function buildAttachmentsSection(detail: GetNoteDetail | null, audioLinks: string[]): string {
  const attachments = Array.isArray(detail?.attachments) ? detail.attachments : [];
  const lines = ["## 附件", ""];
  if (!audioLinks.length && !attachments.length) {
    lines.push("无");
    return lines.join("\n");
  }

  for (const audioLink of audioLinks) {
    lines.push(`- 音频文件: ![[${audioLink}]]`);
  }
  for (const attachment of attachments) {
    if (attachment?.type === "audio") continue;
    const title = attachment?.title || attachment?.type || "附件";
    lines.push(`- ${title}: ${attachment?.url || "无 URL"}`);
  }
  return lines.join("\n");
}

export function renderMarkdown(record: RawNoteRecord, stem: string, audioLinks: string[]): string {
  const detail = record.detail;
  const title = detail?.title || record.summary.title || stem;
  const noteType = detail?.note_type || record.summary.note_type || "";
  const summary = summaryMarkdown(record);
  const body = bodyMarkdown(detail);
  const sameSummaryAndBody = isSubstantiallySameText(summary, body);
  const sections = [
    renderFrontmatter(detail, record.summary, stem),
    `# ${title}`,
    "",
    buildOverview(detail, record.summary, audioLinks),
    "",
    buildTagSection(detail),
    ""
  ];

  if (noteType === "plain_text" || noteType === "link") {
    if (body) {
      sections.push("## 笔记内容", "", body, "");
    }
    if (summary && !sameSummaryAndBody) {
      sections.push("## 智能总结", "", summary, "");
    }
  } else {
    if (summary) {
      sections.push("## 智能总结", "", summary, "");
    }
    if (body && !sameSummaryAndBody) {
      sections.push("## 笔记内容", "", body, "");
    } else if (!body && summary) {
      sections.push("## 笔记内容", "", unavailableContentMessage(noteType), "");
    }
  }

  const originalRef = originalReference(detail);
  if (originalRef) sections.push("## 原始引用", "", originalRef, "");

  sections.push(buildAttachmentsSection(detail, audioLinks), "");
  return sections.join("\n").trim() + "\n";
}
