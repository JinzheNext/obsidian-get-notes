import { App, normalizePath } from "obsidian";
import { MigrationReport, PluginSyncState } from "../types";
import { normalizeMatchTitle } from "../canonical/common";
import { ensureVaultFolder } from "../utils/path";

interface NoteSnapshot {
  path: string;
  source: "api" | "legacy" | "unknown";
  canonicalId?: string;
  noteId?: string;
  title: string;
  updatedAt: number | null;
  body: string;
}

function parseFrontmatterValue(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
}

function parseSnapshot(path: string, content: string): NoteSnapshot {
  const canonicalId = parseFrontmatterValue(content, "canonicalId") || parseFrontmatterValue(content, "canonical_id");
  const noteId = parseFrontmatterValue(content, "note_id") || canonicalId?.replace(/^api:/, "");
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || parseFrontmatterValue(content, "title") || path.split("/").pop() || path;
  const updated = parseFrontmatterValue(content, "updated") || parseFrontmatterValue(content, "updated_at");
  const source = parseFrontmatterValue(content, "source");
  return {
    path,
    source: source === "api" || source === "legacy" ? source : path.includes("API 模式") || path.includes("/openapi/") ? "api" : path.includes("普通登录模式") || path.includes("/legacy/") ? "legacy" : "unknown",
    canonicalId: canonicalId || undefined,
    noteId: noteId || undefined,
    title,
    updatedAt: updated ? Date.parse(updated) || null : null,
    body: content.trim()
  };
}

async function listMarkdownFiles(app: App, root: string): Promise<string[]> {
  if (!(await app.vault.adapter.exists(root))) return [];
  const results: string[] = [];
  const walk = async (current: string): Promise<void> => {
    const listing = await app.vault.adapter.list(current).catch(() => null);
    if (!listing) return;
    for (const file of listing.files) {
      if (file.endsWith(".md")) results.push(normalizePath(file));
    }
    for (const folder of listing.folders) {
      await walk(folder);
    }
  };
  await walk(root);
  return results;
}

function similarity(left: string, right: string): number {
  const leftSet = new Set(left.toLowerCase().split(/\W+/).filter(Boolean));
  const rightSet = new Set(right.toLowerCase().split(/\W+/).filter(Boolean));
  if (!leftSet.size || !rightSet.size) return 0;
  let common = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) common += 1;
  }
  return (2 * common) / (leftSet.size + rightSet.size);
}

function strongMatch(left: NoteSnapshot, right: NoteSnapshot): boolean {
  if (left.noteId && right.noteId && left.noteId === right.noteId) return true;
  if (left.canonicalId && right.canonicalId && left.canonicalId === right.canonicalId) return true;
  if (normalizeMatchTitle(left.title) === normalizeMatchTitle(right.title) && left.updatedAt && right.updatedAt) {
    return Math.abs(left.updatedAt - right.updatedAt) < 5 * 60 * 1000;
  }
  return false;
}

function buildCompletenessDiff(api: NoteSnapshot, legacy: NoteSnapshot): string[] {
  const diff: string[] = [];
  if (legacy.body.length > api.body.length) diff.push("body: legacy richer");
  if (api.body.length > legacy.body.length) diff.push("body: api richer");
  if ((api.updatedAt || 0) > (legacy.updatedAt || 0)) diff.push("updatedAt: api newer");
  if ((legacy.updatedAt || 0) > (api.updatedAt || 0)) diff.push("updatedAt: legacy newer");
  return diff;
}

export async function generateMigrationReport(
  app: App,
  pluginId: string,
  targetFolder: string,
  state: PluginSyncState
): Promise<MigrationReport> {
  const roots = [
    normalizePath(`${targetFolder}/API 模式`),
    normalizePath(`${targetFolder}/普通登录模式`),
    normalizePath(`${targetFolder}/openapi`),
    normalizePath(`${targetFolder}/legacy`)
  ];
  const files = (await Promise.all(roots.map((root) => listMarkdownFiles(app, root)))).flat();
  const currentFiles = Object.values(state.notesByCanonicalId)
    .map((entry) => normalizePath(entry.filePath))
    .filter(Boolean);
  const allFiles = [...new Set([...files, ...currentFiles])];
  const snapshots: NoteSnapshot[] = [];

  for (const filePath of allFiles) {
    if (!(await app.vault.adapter.exists(filePath))) continue;
    const content = await app.vault.adapter.read(filePath).catch(() => "");
    if (!content) continue;
    snapshots.push(parseSnapshot(filePath, content));
  }

  const apis = snapshots.filter((item) => item.source === "api");
  const legacies = snapshots.filter((item) => item.source === "legacy");
  const usedApi = new Set<string>();
  const usedLegacy = new Set<string>();
  const report: MigrationReport = {
    matches: [],
    conflicts: [],
    unmatched: []
  };

  for (const api of apis) {
    const strong = legacies.find((legacy) => !usedLegacy.has(legacy.path) && strongMatch(api, legacy));
    if (strong) {
      usedApi.add(api.path);
      usedLegacy.add(strong.path);
      report.matches.push({
        canonicalId: api.canonicalId || strong.canonicalId || `api:${api.noteId || strong.noteId || api.title}`,
        apiPath: api.path,
        legacyPath: strong.path,
        winner: api.body.length >= strong.body.length ? "api" : "legacy",
        completenessDiff: buildCompletenessDiff(api, strong)
      });
      continue;
    }

    const weak = legacies.find(
      (legacy) =>
        !usedLegacy.has(legacy.path) &&
        (similarity(api.title, legacy.title) > 0.8 || similarity(api.body, legacy.body) > 0.8)
    );
    if (weak) {
      report.conflicts.push({
        reason: "weak match only",
        candidates: [api.path, weak.path]
      });
      usedApi.add(api.path);
      usedLegacy.add(weak.path);
    }
  }

  for (const snapshot of snapshots) {
    if (usedApi.has(snapshot.path) || usedLegacy.has(snapshot.path)) continue;
    report.unmatched.push(snapshot.path);
  }

  const reportDir = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/reports`);
  await ensureVaultFolder(app, reportDir);
  await app.vault.adapter.write(normalizePath(`${reportDir}/migration-report.json`), JSON.stringify(report, null, 2));
  return report;
}
