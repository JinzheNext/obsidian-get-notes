import { LegacySyncStage } from "../types";
import { legacyStageMessage } from "./progress";

function prefix(step: string): string {
  return `[Get Notes][legacy] ${step}`;
}

export function legacyLog(step: string, detail?: unknown): void {
  if (detail === undefined) {
    console.log(prefix(step));
    return;
  }
  console.log(prefix(step), detail);
}

export function legacyWarn(step: string, detail?: unknown): void {
  if (detail === undefined) {
    console.warn(prefix(step));
    return;
  }
  console.warn(prefix(step), detail);
}

export function legacyError(step: string, detail?: unknown): void {
  if (detail === undefined) {
    console.error(prefix(step));
    return;
  }
  console.error(prefix(step), detail);
}

export function legacyStageLog(stage: LegacySyncStage, detail?: Record<string, unknown>): void {
  const step = `[${stage}] ${legacyStageMessage(stage)}`;
  if (detail === undefined) {
    console.log(prefix(step));
    return;
  }
  console.log(prefix(step), detail);
}
