import { normalizePath } from "obsidian";

export function buildAudioPath(targetFolder: string, stem: string, index: number, ext: string): string {
  return normalizePath(`${targetFolder}/_assets/audio/${stem}-${String(index + 1).padStart(2, "0")}.${ext}`);
}
