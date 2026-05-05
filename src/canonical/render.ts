import { CanonicalNote } from "../types";
import { isSubstantiallySameText } from "../render/TextCompare";
import { normalizeText } from "./common";

function formatUpdated(value: number | null): string {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString();
}

export function renderCanonicalMarkdown(
  note: CanonicalNote,
  assetLinks: {
    audios: string[];
    images: string[];
    files: string[];
  },
  sourceLabel: "api" | "legacy"
): string {
  const summary = normalizeText(note.content.summary);
  const body = normalizeText(note.content.body);
  const sameSummaryAndBody = summary && body ? isSubstantiallySameText(summary, body) : false;
  const renderedBody = sameSummaryAndBody ? "" : body;
  const lines = [
    `# ${note.title}`,
    "",
    "## 🧠 摘要",
    summary || "（暂无摘要）",
    "",
    "## 📝 正文",
    renderedBody || (sameSummaryAndBody ? "（正文与摘要一致，已省略重复内容）" : "（暂无正文内容）"),
    "",
    "## 🔗 来源",
    normalizeText(note.content.reference) || "（暂无来源信息）",
    "",
    "## 📎 附件",
    `- 音频：${assetLinks.audios.length ? assetLinks.audios.map((link) => `![[${link}]]`).join(" ") : "无"}`,
    `- 图片：${assetLinks.images.length ? assetLinks.images.map((link) => `![[${link}]]`).join(" ") : "无"}`,
    `- 文件：${assetLinks.files.length ? assetLinks.files.map((link) => `![[${link}]]`).join(" ") : "无"}`,
    "---",
    `source: ${sourceLabel}`,
    `updated: ${formatUpdated(note.updatedAt)}`,
    `canonicalId: ${note.canonicalId}`
  ];
  return `${lines.join("\n").trim()}\n`;
}

