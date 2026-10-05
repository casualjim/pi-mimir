import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
 DEFAULT_CHECKPOINT_LIST_LIMIT,
 DEFAULT_MAX_CHECKPOINTS,
 DEFAULT_SETTINGS,
 type PiJjSettings,
 type RestoreMode,
} from "./types.js";

export interface SettingsStore {
 settingsFile: string;
 getSettings(): PiJjSettings;
 clearCache(): void;
 updateSetting(key: keyof PiJjSettings, value: unknown): void;
}

/**
 * Resolve the host settings file pi-jj reads and writes.
 * `PI_CODING_AGENT_DIR` (omp + pi honour it) → host agent dir
 * (`~/.omp/agent` for omp, `~/.pi/agent` for pi). omp's ExtensionAPI
 * exposes `zod`; pi's does not (same probe as pi-headroom/pi-pstack).
 */
export function resolveSettingsFile(api: unknown, env: NodeJS.ProcessEnv = process.env): string {
 const agentDir = env.PI_CODING_AGENT_DIR?.trim();
 if (agentDir) {
  return join(agentDir.replace(/^~(?=\/|$)/, homedir()), "settings.json");
 }
 const isOmp = typeof api === "object" && api !== null && "zod" in api && typeof api.zod !== "undefined";
 return join(homedir(), isOmp ? ".omp" : ".pi", "agent", "settings.json");
}

function clamp(value: number, min: number, max: number): number {
 return Math.max(min, Math.min(max, value));
}

export function createSettingsStore(settingsFile: string): SettingsStore {
 let cachedSettings: PiJjSettings | null = null;

 function getSettings(): PiJjSettings {
  if (cachedSettings) return cachedSettings;

  try {
   const raw = readFileSync(settingsFile, "utf-8");
   const parsed = JSON.parse(raw) as Record<string, unknown>;
   const fromNamed = (parsed.piJj ?? parsed["pi-jj"]) as Record<string, unknown> | undefined;

   const silentCheckpoints = fromNamed?.silentCheckpoints === true;
   const promptForInit = fromNamed?.promptForInit !== false;
   const promptForPublishMode = fromNamed?.promptForPublishMode !== false;
   const autoSyncOnPublish = fromNamed?.autoSyncOnPublish !== false;

   const maxCandidate = Number(fromNamed?.maxCheckpoints);
   const maxCheckpoints = Number.isFinite(maxCandidate)
    ? clamp(Math.floor(maxCandidate), 10, 5000)
    : DEFAULT_MAX_CHECKPOINTS;

   const listCandidate = Number(fromNamed?.checkpointListLimit);
   const checkpointListLimit = Number.isFinite(listCandidate)
    ? clamp(Math.floor(listCandidate), 5, 200)
    : DEFAULT_CHECKPOINT_LIST_LIMIT;

   const rawRestoreMode = String(fromNamed?.restoreMode ?? "").toLowerCase();
   const restoreMode: RestoreMode = rawRestoreMode === "operation" ? "operation" : "file";

   cachedSettings = {
    silentCheckpoints,
    maxCheckpoints,
    checkpointListLimit,
    promptForInit,
    promptForPublishMode,
    autoSyncOnPublish,
    restoreMode,
   };
   return cachedSettings;
  } catch {
   cachedSettings = { ...DEFAULT_SETTINGS };
   return cachedSettings;
  }
 }

 function clearCache() {
  cachedSettings = null;
 }

 function updateSetting(key: keyof PiJjSettings, value: unknown) {
  let parsed: Record<string, unknown> = {};
  try {
   parsed = JSON.parse(readFileSync(settingsFile, "utf-8")) as Record<string, unknown>;
  } catch {
   // file doesn't exist or is invalid — start fresh
  }

  const section = ((parsed.piJj ?? parsed["pi-jj"]) as Record<string, unknown> | undefined) ?? {};
  section[key] = value;
  parsed.piJj = section;

  mkdirSync(dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, JSON.stringify(parsed, null, 2) + "\n", "utf-8");

  clearCache();
 }

 return {
  settingsFile,
  getSettings,
  clearCache,
  updateSetting,
 };
}
