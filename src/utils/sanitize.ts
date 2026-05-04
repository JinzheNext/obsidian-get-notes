export function sanitizeFileName(input: string): string {
  const value = String(input || "").trim();
  const cleaned = value
    .replace(/[\/\\:*?"<>|#^\[\]\u0000-\u001F]/g, "-")
    .replace(/-+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = cleaned.replace(/^-+|-+$/g, "").trim();
  return (normalized || "Untitled").slice(0, 120);
}
