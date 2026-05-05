import { CanonicalNote, CompletenessSource } from "../types";
import { buildCanonicalFingerprint, dedupeAssets, dedupeStrings, normalizeText } from "./common";

const SOURCE_PRIORITY: Record<CompletenessSource, number> = {
  none: 0,
  html: 1,
  legacy: 2,
  api: 3
};

function chooseText(
  leftValue: string | null,
  leftSource: CompletenessSource,
  rightValue: string | null,
  rightSource: CompletenessSource
): { value: string | null; source: CompletenessSource } {
  const leftText = normalizeText(leftValue);
  const rightText = normalizeText(rightValue);
  if (!leftText && !rightText) return { value: null, source: "none" };
  if (!leftText) return { value: rightText || null, source: rightSource };
  if (!rightText) return { value: leftText || null, source: leftSource };

  const leftRank = SOURCE_PRIORITY[leftSource];
  const rightRank = SOURCE_PRIORITY[rightSource];
  if (rightRank > leftRank) return { value: rightText, source: rightSource };
  if (leftRank > rightRank) return { value: leftText, source: leftSource };
  if (rightText.length > leftText.length) return { value: rightText, source: rightSource };
  return { value: leftText, source: leftSource };
}

function chooseReference(left: CanonicalNote, right: CanonicalNote): string | null {
  const leftText = normalizeText(left.content.reference);
  const rightText = normalizeText(right.content.reference);
  if (!leftText && !rightText) return null;
  if (!leftText) return rightText || null;
  if (!rightText) return leftText || null;
  const leftRank = left.sourceIds.api ? 3 : left.sourceIds.legacy ? 2 : 1;
  const rightRank = right.sourceIds.api ? 3 : right.sourceIds.legacy ? 2 : 1;
  if (rightRank > leftRank) return rightText;
  if (leftRank > rightRank) return leftText;
  return rightText.length > leftText.length ? rightText : leftText;
}

export function mergeCanonicalNotes(primary: CanonicalNote, secondary: CanonicalNote): CanonicalNote {
  const summary = chooseText(
    primary.content.summary,
    primary.completeness.summary,
    secondary.content.summary,
    secondary.completeness.summary
  );
  const body = chooseText(primary.content.body, primary.completeness.body, secondary.content.body, secondary.completeness.body);
  const merged = {
    canonicalId: primary.sourceIds.api
      ? `api:${primary.sourceIds.api}`
      : secondary.sourceIds.api
        ? `api:${secondary.sourceIds.api}`
        : primary.canonicalId,
    sourceIds: {
      api: primary.sourceIds.api || secondary.sourceIds.api,
      legacy: primary.sourceIds.legacy || secondary.sourceIds.legacy
    },
    title: normalizeText(primary.title) || normalizeText(secondary.title) || "Untitled",
    type: primary.type !== "other" ? primary.type : secondary.type,
    createdAt: primary.createdAt ?? secondary.createdAt,
    updatedAt: Math.max(primary.updatedAt || 0, secondary.updatedAt || 0) || null,
    content: {
      summary: summary.value,
      body: body.value,
      reference: chooseReference(primary, secondary)
    },
    tags: dedupeStrings([...primary.tags, ...secondary.tags]),
    notebook: primary.notebook || secondary.notebook,
    assets: {
      audios: dedupeAssets([...primary.assets.audios, ...secondary.assets.audios]),
      images: dedupeAssets([...primary.assets.images, ...secondary.assets.images]),
      files: dedupeAssets([...primary.assets.files, ...secondary.assets.files]),
      links: dedupeStrings([...primary.assets.links, ...secondary.assets.links])
    },
    completeness: {
      summary: summary.source,
      body: body.source,
      assets:
        SOURCE_PRIORITY[secondary.completeness.assets] > SOURCE_PRIORITY[primary.completeness.assets]
          ? secondary.completeness.assets
          : primary.completeness.assets
    }
  } satisfies Omit<CanonicalNote, "fingerprint">;

  return {
    ...merged,
    fingerprint: buildCanonicalFingerprint(merged)
  };
}

