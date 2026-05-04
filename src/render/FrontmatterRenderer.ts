import { GetNoteDetail, GetNoteSummary } from "../api/types";

function yamlScalar(value: unknown): string {
  return JSON.stringify(value ?? "");
}

function mapDisplayType(noteType?: string): string {
  switch (noteType) {
    case "meeting":
    case "audio":
    case "local_audio":
      return "录音笔记";
    case "link":
      return "AI链接笔记";
    case "plain_text":
      return "纯文本笔记";
    default:
      return noteType || "未知";
  }
}

export function renderFrontmatter(detail: GetNoteDetail | null, summary: GetNoteSummary, stem: string): string {
  const tags = Array.isArray(detail?.tags) ? detail?.tags.map((tag) => tag?.name).filter(Boolean) : [];
  const topics = Array.isArray(detail?.topics)
    ? detail?.topics.map((topic) => topic?.name || topic?.topic_id || topic?.id).filter(Boolean)
    : [];

  const lines = [
    "---",
    `title: ${yamlScalar(detail?.title || summary.title || stem)}`,
    `note_id: ${yamlScalar(detail?.note_id || summary.note_id || "")}`,
    `type: ${yamlScalar(mapDisplayType(detail?.note_type || summary.note_type || ""))}`,
    `note_type: ${yamlScalar(detail?.note_type || summary.note_type || "")}`,
    `source: ${yamlScalar(detail?.source || summary.source || "")}`,
    `entry_type: ${yamlScalar(detail?.entry_type || "")}`,
    `created_at: ${yamlScalar(detail?.created_at || summary.created_at || "")}`,
    `updated_at: ${yamlScalar(detail?.updated_at || summary.updated_at || "")}`,
    `children_count: ${detail?.children_count ?? 0}`,
    "tags:"
  ];

  if (tags.length) {
    for (const tag of tags) lines.push(`  - ${yamlScalar(tag)}`);
  } else {
    lines.push("  []");
  }

  lines.push("topics:");
  if (topics.length) {
    for (const topic of topics) lines.push(`  - ${yamlScalar(topic)}`);
  } else {
    lines.push("  []");
  }

  lines.push("---");
  return lines.join("\n");
}
