import { gunzipSync, inflateRawSync, inflateSync, brotliDecompressSync } from "zlib";
import { HTMLElement, parse } from "node-html-parser";
import { Asset } from "../types";
import { decodeHtmlEntities, dedupeAssets, dedupeStrings, normalizeCanonicalType, nullIfEmpty, toTimestamp } from "../canonical/common";

export interface LegacyDecodedPayload {
  version: string;
  id?: string;
  title?: string;
  type?: string;
  createdAt: number | null;
  updatedAt: number | null;
  summary: string | null;
  body: string | null;
  reference: string | null;
  tags: string[];
  notebook: string | null;
  assets: {
    audios: Asset[];
    images: Asset[];
    files: Asset[];
    links: string[];
  };
}

type LegacyVersionParser = (payload: Record<string, unknown>) => LegacyDecodedPayload | null;

function parseJsonCandidate(buffer: Buffer): Record<string, unknown> | null {
  const variants = [
    buffer,
    safeDecompress(buffer, gunzipSync),
    safeDecompress(buffer, inflateSync),
    safeDecompress(buffer, inflateRawSync),
    safeDecompress(buffer, brotliDecompressSync)
  ].filter(Boolean) as Buffer[];

  for (const candidate of variants) {
    const text = candidate.toString("utf8").trim();
    if (!text.startsWith("{") && !text.startsWith("[")) continue;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (_error) {
      continue;
    }
  }
  return null;
}

function safeDecompress(buffer: Buffer, fn: (value: Buffer) => Buffer): Buffer | null {
  try {
    return fn(buffer);
  } catch (_error) {
    return null;
  }
}

function pickFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            const name = (item as Record<string, unknown>).name;
            return typeof name === "string" ? name.trim() : "";
          }
          return "";
        })
        .filter(Boolean);
    }
  }
  return [];
}

function normalizeAssets(record: Record<string, unknown>): LegacyDecodedPayload["assets"] {
  const audios: Asset[] = [];
  const images: Asset[] = [];
  const files: Asset[] = [];
  const links: string[] = [];

  const collections = [
    record.attachments,
    record.assets,
    record.files,
    record.resources
  ];

  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      if (!item || typeof item !== "object") continue;
      const source = pickFirstString(item as Record<string, unknown>, ["url", "source", "src", "path", "file_url"]);
      if (!source) continue;
      const type = pickFirstString(item as Record<string, unknown>, ["type", "kind", "asset_type"]) || "";
      const title = pickFirstString(item as Record<string, unknown>, ["title", "name", "filename"]) || source;
      const ext = source.match(/\.([a-z0-9]{1,10})(?:\?|$)/i)?.[1]?.toLowerCase();
      if (type === "link") {
        links.push(source);
      } else if (type === "image") {
        images.push({ kind: "image", source, title, ext });
      } else if (type === "audio") {
        audios.push({ kind: "audio", source, title, ext });
      } else {
        files.push({ kind: "file", source, title, ext });
      }
    }
  }

  for (const key of ["links", "source_links", "reference_links"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) links.push(item.trim());
      }
    }
  }

  return {
    audios: dedupeAssets(audios),
    images: dedupeAssets(images),
    files: dedupeAssets(files),
    links: dedupeStrings(links)
  };
}

function parseVersion1(payload: Record<string, unknown>): LegacyDecodedPayload | null {
  const note = (payload.note && typeof payload.note === "object" ? payload.note : payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  const version = pickFirstString(payload, ["version", "schemaVersion"]) || "1";
  const createdAt = toTimestamp(note.createdAt ?? note.created_at ?? note.dateTime);
  const updatedAt = toTimestamp(note.updatedAt ?? note.updated_at ?? note.dateTime ?? note.createdAt ?? note.created_at);
  const reference = nullIfEmpty(note.reference ?? note.ref_content ?? note.source ?? note.url);
  const assets = normalizeAssets(note);
  return {
    version,
    id: pickFirstString(note, ["id", "note_id", "noteId", "legacyId"]) || undefined,
    title: pickFirstString(note, ["title", "name"]) || undefined,
    type: normalizeCanonicalType(pickFirstString(note, ["type", "note_type", "noteType"]) || undefined),
    createdAt,
    updatedAt,
    summary: nullIfEmpty(note.summary ?? note.abstract ?? note.content_summary),
    body: nullIfEmpty(note.body ?? note.content ?? note.original_content ?? note.transcript),
    reference,
    tags: pickStringArray(note, ["tags", "tag_list"]),
    notebook: nullIfEmpty(note.notebook ?? note.topic ?? note.topic_name),
    assets
  };
}

const VERSION_PARSERS: Record<string, LegacyVersionParser> = {
  "1": parseVersion1,
  v1: parseVersion1
};

function extractRawPayload(root: HTMLElement): { version: string | null; encoded: string | null } {
  const node = root.querySelector("#jsonData");
  if (!node) return { version: null, encoded: null };
  return {
    version: node.getAttribute("data-version") || node.getAttribute("version") || null,
    encoded: node.getAttribute("data-json") || null
  };
}

export function decodeLegacyDataJson(html: string): LegacyDecodedPayload | null {
  try {
    const root = parse(html);
    const { version: attrVersion, encoded } = extractRawPayload(root);
    if (!encoded) return null;
    const decodedBase64 = Buffer.from(decodeHtmlEntities(encoded), "base64");
    const payload = parseJsonCandidate(decodedBase64);
    if (!payload) return null;
    const version = attrVersion || pickFirstString(payload, ["version", "schemaVersion"]);
    if (!version) return null;
    const parser = VERSION_PARSERS[version];
    if (!parser) return null;
    return parser(payload);
  } catch (_error) {
    return null;
  }
}
