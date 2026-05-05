import { GetNoteDetail, GetNoteSummary } from "../api/types";
import { Asset, CanonicalNote } from "../types";
import { noteIdentity, noteTitle } from "../storage/helpers";
import {
  buildCanonicalId,
  buildReferenceFromLinks,
  dedupeAssets,
  dedupeStrings,
  finalizeCanonicalNote,
  normalizeCanonicalType,
  normalizeText,
  nullIfEmpty,
  toTimestamp
} from "./common";

function hasSmartSummary(detail: GetNoteDetail | null): boolean {
  const text = normalizeText(detail?.content);
  return text.startsWith("### 📑 智能总结") || text.includes("### ✨ 金句精选") || text.includes("### 📋 待办事项");
}

function summaryMarkdown(summary: GetNoteSummary, detail: GetNoteDetail | null): string | null {
  const candidate = normalizeText(summary.content || detail?.content);
  if (!candidate) return null;
  if (candidate.startsWith("### 📑 智能总结")) {
    return candidate.replace(/^###\s+📑\s+智能总结\s*\n*/u, "").trim() || null;
  }
  return candidate;
}

function bodyMarkdown(detail: GetNoteDetail | null): string | null {
  const transcript = normalizeText(detail?.audio?.original);
  if (transcript) return transcript;
  const content = normalizeText(detail?.content);
  if (!hasSmartSummary(detail) && content) return content;
  return null;
}

function normalizeAttachments(detail: GetNoteDetail | null): {
  audios: Asset[];
  images: Asset[];
  files: Asset[];
  links: string[];
} {
  const audios: Asset[] = [];
  const images: Asset[] = [];
  const files: Asset[] = [];
  const links: string[] = [];
  const pushAsset = (target: Asset[], kind: Asset["kind"], source: string, title: string, ext?: string): void => {
    if (!source) return;
    target.push({ kind, source, title: title || source, ext });
  };

  const playUrl = normalizeText(detail?.audio?.play_url);
  if (playUrl) {
    const ext = playUrl.match(/\.(m4a|mp3|wav|aac|amr)(?:\?|$)/i)?.[1]?.toLowerCase();
    pushAsset(audios, "audio", playUrl, "音频", ext);
  }

  for (const attachment of Array.isArray(detail?.attachments) ? detail.attachments : []) {
    const url = normalizeText(attachment?.url);
    if (!url) continue;
    if (attachment?.type === "link") {
      links.push(url);
      continue;
    }

    const ext = url.match(/\.([a-z0-9]{1,10})(?:\?|$)/i)?.[1]?.toLowerCase();
    if (attachment?.type === "image") {
      pushAsset(images, "image", url, attachment?.title || "图片", ext);
    } else if (attachment?.type === "audio") {
      pushAsset(audios, "audio", url, attachment?.title || "音频", ext);
    } else {
      pushAsset(files, "file", url, attachment?.title || attachment?.type || "文件", ext);
    }
  }

  return {
    audios: dedupeAssets(audios),
    images: dedupeAssets(images),
    files: dedupeAssets(files),
    links: dedupeStrings(links)
  };
}

function reference(detail: GetNoteDetail | null, linkUrls: string[]): string | null {
  const refContent = nullIfEmpty(detail?.ref_content);
  if (refContent) return refContent;
  return buildReferenceFromLinks(linkUrls);
}

export function canonicalizeApiNote(summary: GetNoteSummary, detail: GetNoteDetail | null): CanonicalNote {
  const apiId = noteIdentity(detail || summary) || undefined;
  const normalizedAssets = normalizeAttachments(detail);
  const normalizedSummary = summaryMarkdown(summary, detail);
  const normalizedBody = bodyMarkdown(detail);
  const normalizedTitle = normalizeText(detail?.title || noteTitle(summary));
  const createdAt = toTimestamp(detail?.created_at || summary.created_at);
  const updatedAt = toTimestamp(detail?.updated_at || summary.updated_at);
  const note = finalizeCanonicalNote({
    canonicalId: buildCanonicalId({
      apiId,
      title: normalizedTitle || "Untitled",
      createdAt,
      body: normalizedBody
    }),
    sourceIds: apiId ? { api: apiId } : {},
    title: normalizedTitle || "Untitled",
    type: normalizeCanonicalType(detail?.note_type || summary.note_type),
    createdAt,
    updatedAt,
    content: {
      summary: normalizedSummary,
      body: normalizedBody,
      reference: reference(detail, normalizedAssets.links)
    },
    tags: dedupeStrings((Array.isArray(detail?.tags) ? detail?.tags : []).map((item) => item?.name || "")),
    notebook: nullIfEmpty(Array.isArray(detail?.topics) ? detail?.topics[0]?.name : null),
    assets: normalizedAssets,
    completeness: {
      summary: normalizedSummary ? "api" : "none",
      body: normalizedBody ? "api" : "none",
      assets:
        normalizedAssets.audios.length || normalizedAssets.images.length || normalizedAssets.files.length || normalizedAssets.links.length
          ? "api"
          : "none"
    }
  });
  return note;
}

