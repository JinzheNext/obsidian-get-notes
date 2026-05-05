import { CanonicalNote } from "../types";
import { LegacyDecodedPayload } from "../legacy/decodeDataJson";
import { LegacyHtmlFallbackNote } from "../legacy/htmlFallback";
import {
  buildCanonicalId,
  dedupeAssets,
  dedupeStrings,
  finalizeCanonicalNote,
  normalizeCanonicalType,
  normalizeText,
  nullIfEmpty
} from "./common";

function hasAssets(note: {
  assets: {
    audios: unknown[];
    images: unknown[];
    files: unknown[];
    links: unknown[];
  };
}): boolean {
  return note.assets.audios.length > 0 || note.assets.images.length > 0 || note.assets.files.length > 0 || note.assets.links.length > 0;
}

export function canonicalizeLegacyNote(
  decodedPayload: LegacyDecodedPayload | null,
  htmlFallback: LegacyHtmlFallbackNote
): CanonicalNote {
  const legacyId = decodedPayload?.id || htmlFallback.id;
  const summary = nullIfEmpty(decodedPayload?.summary) ?? htmlFallback.summary;
  const body = nullIfEmpty(decodedPayload?.body) ?? htmlFallback.body;
  const reference = nullIfEmpty(decodedPayload?.reference) ?? htmlFallback.reference;
  const assetSource = decodedPayload && hasAssets(decodedPayload) ? decodedPayload.assets : htmlFallback.assets;
  const tags = dedupeStrings([...(decodedPayload?.tags || []), ...htmlFallback.tags]);
  const title = normalizeText(decodedPayload?.title || htmlFallback.title) || "Untitled";
  const createdAt = decodedPayload?.createdAt ?? htmlFallback.createdAt;
  const updatedAt = decodedPayload?.updatedAt ?? htmlFallback.updatedAt;

  return finalizeCanonicalNote({
    canonicalId: buildCanonicalId({
      legacyId,
      title,
      createdAt,
      body
    }),
    sourceIds: legacyId ? { legacy: legacyId } : {},
    title,
    type: normalizeCanonicalType(decodedPayload?.type || htmlFallback.type),
    createdAt,
    updatedAt,
    content: {
      summary,
      body,
      reference
    },
    tags,
    notebook: nullIfEmpty(decodedPayload?.notebook) ?? htmlFallback.notebook,
    assets: {
      audios: dedupeAssets(assetSource.audios),
      images: dedupeAssets(assetSource.images),
      files: dedupeAssets(assetSource.files),
      links: dedupeStrings(assetSource.links)
    },
    completeness: {
      summary: summary ? (decodedPayload?.summary ? "legacy" : htmlFallback.summary ? "html" : "none") : "none",
      body: body ? (decodedPayload?.body ? "legacy" : htmlFallback.body ? "html" : "none") : "none",
      assets: hasAssets({ assets: assetSource })
        ? decodedPayload && hasAssets(decodedPayload)
          ? "legacy"
          : "html"
        : "none"
    }
  });
}

