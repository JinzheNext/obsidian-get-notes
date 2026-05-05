import { Asset, CanonicalNote, CanonicalNoteType } from "../types";
import { hashText } from "../utils/hash";

export function normalizeText(value: unknown): string {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

export function decodeHtmlEntities(value: string): string {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

export function normalizeMatchTitle(value: unknown): string {
  return decodeHtmlEntities(String(value || ""))
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[：]/g, ":")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

export function nullIfEmpty(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized || null;
}

export function toTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  const numeric = Number(String(value));
  if (Number.isFinite(numeric) && String(value).trim() !== "") {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  }

  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

export function normalizeCanonicalType(noteType?: string | null): CanonicalNoteType {
  switch (noteType) {
    case "audio":
    case "local_audio":
      return "audio";
    case "meeting":
      return "meeting";
    case "plain_text":
    case "text":
      return "text";
    case "link":
      return "link";
    default:
      return "other";
  }
}

export function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function dedupeAssets(values: Asset[]): Asset[] {
  const seen = new Set<string>();
  const result: Asset[] = [];
  for (const value of values) {
    const key = `${value.kind}|${value.source}|${value.title}|${value.ext || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function buildCanonicalId(input: {
  apiId?: string;
  legacyId?: string;
  title: string;
  createdAt: number | null;
  body: string | null;
}): string {
  if (input.apiId) return `api:${input.apiId}`;
  if (input.legacyId) return `legacy:${input.legacyId}`;
  const fallback = `${input.title}\n${input.createdAt || ""}\n${(input.body || "").slice(0, 1000)}`;
  return `fallback:${hashText(fallback)}`;
}

export function serializeAssets(note: Pick<CanonicalNote, "assets">): string {
  return JSON.stringify({
    audios: note.assets.audios.map((item) => [item.source, item.title, item.ext || ""]),
    images: note.assets.images.map((item) => [item.source, item.title, item.ext || ""]),
    files: note.assets.files.map((item) => [item.source, item.title, item.ext || ""]),
    links: note.assets.links
  });
}

export function buildCanonicalFingerprint(note: Omit<CanonicalNote, "fingerprint">): string {
  return hashText(
    [
      note.content.summary || "",
      note.content.body || "",
      note.content.reference || "",
      serializeAssets(note),
      note.updatedAt || ""
    ].join("\n---\n")
  );
}

export function finalizeCanonicalNote(note: Omit<CanonicalNote, "fingerprint">): CanonicalNote {
  return {
    ...note,
    fingerprint: buildCanonicalFingerprint(note)
  };
}

export function buildReferenceFromLinks(urls: string[]): string | null {
  if (!urls.length) return null;
  return urls.map((url) => `- ${url}`).join("\n");
}
