import { sanitizeFileName } from "../utils/sanitize";

export function buildStem(localSequence: number, title: string, stableIdSuffix: string): string {
  return `${String(localSequence).padStart(4, "0")}-${sanitizeFileName(title)}-${stableIdSuffix}`;
}
