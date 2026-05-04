import { Notice } from "obsidian";

export function showInfo(message: string): void {
  new Notice(message, 4000);
}

export function showError(message: string): void {
  new Notice(message, 7000);
}
