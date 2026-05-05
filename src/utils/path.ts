import { App, normalizePath, TFile } from "obsidian";

export function joinVaultPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join("/"));
}

export async function ensureVaultFolder(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath);
  if (!normalized || normalized === ".") return;
  const exists = await app.vault.adapter.exists(normalized);
  if (exists) return;

  const segments = normalized.split("/");
  let current = "";
  for (const segment of segments) {
    current = current ? normalizePath(`${current}/${segment}`) : segment;
    const currentExists = await app.vault.adapter.exists(current);
    if (!currentExists) {
      await app.vault.createFolder(current);
    }
  }
}

export async function upsertVaultFile(app: App, filePath: string, contents: string): Promise<void> {
  const normalized = normalizePath(filePath);
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, contents);
    return;
  }

  await ensureVaultFolder(app, normalized.split("/").slice(0, -1).join("/"));
  await app.vault.create(normalized, contents);
}

export async function writeBinaryFile(app: App, filePath: string, bytes: ArrayBuffer): Promise<void> {
  const normalized = normalizePath(filePath);
  await ensureVaultFolder(app, normalized.split("/").slice(0, -1).join("/"));
  await app.vault.adapter.writeBinary(normalized, bytes);
}

export async function removePathIfExists(app: App, targetPath: string): Promise<void> {
  const normalized = normalizePath(targetPath);
  const exists = await app.vault.adapter.exists(normalized);
  if (!exists) return;
  const listing = await app.vault.adapter.list(normalized).catch(() => null);
  if (!listing) {
    await app.vault.adapter.remove(normalized);
    return;
  }

  for (const file of listing.files) {
    await app.vault.adapter.remove(file);
  }
  for (const folder of listing.folders.sort((a, b) => b.length - a.length)) {
    await removePathIfExists(app, folder);
  }
  await app.vault.adapter.rmdir(normalized, false).catch(async () => {
    const remaining = await app.vault.adapter.list(normalized).catch(() => null);
    if (remaining && remaining.files.length === 0 && remaining.folders.length === 0) {
      await app.vault.adapter.rmdir(normalized, false);
    }
  });
}

export function toVaultRelativePath(markdownPath: string, targetPath: string): string {
  const markdownParts = normalizePath(markdownPath).split("/");
  markdownParts.pop();
  const audioParts = normalizePath(targetPath).split("/");

  let shared = 0;
  while (shared < markdownParts.length && shared < audioParts.length && markdownParts[shared] === audioParts[shared]) {
    shared += 1;
  }

  const up = markdownParts.slice(shared).map(() => "..");
  const down = audioParts.slice(shared);
  return normalizePath([...up, ...down].join("/"));
}

export function toVaultRelativeAudioLink(markdownPath: string, audioPath: string): string {
  return toVaultRelativePath(markdownPath, audioPath);
}
