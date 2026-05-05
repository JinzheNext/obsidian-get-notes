function normalizeLine(input: string): string {
  return input
    .replace(/^#+\s*/gm, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeForComparison(input: string | undefined | null): string {
  return normalizeLine(String(input || ""));
}

export function isSubstantiallySameText(a: string | undefined | null, b: string | undefined | null): boolean {
  const left = normalizeForComparison(a);
  const right = normalizeForComparison(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (!shorter) return false;

  return longer.includes(shorter) && shorter.length / longer.length >= 0.95;
}
