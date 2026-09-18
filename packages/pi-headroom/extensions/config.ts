import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HeadroomConfig, HeadroomMode } from "./types.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:8787"; // Headroom's own default port; custom ports come from settings/env.
const DEFAULT_MIN_CONTEXT_TOKENS = 20_000;
const DEFAULT_MIN_MESSAGE_CHARS = 2_000;
const DEFAULT_TIMEOUT_MS = 20_000;
// Must stay under omp's per-event extension handler cap (30s, runner.ts
// EXTENSION_HANDLER_TIMEOUT_MS): the compress call runs inside the `context`
// handler, and omp kills the handler at the cap before we can return. pi has no
// such cap, so the tighter budget is safe for both hosts.

export const HEADROOM_SETTINGS_DIR = path.join(os.homedir(), ".pi", "agent", "headroom");
export const HEADROOM_SETTINGS_FILE = path.join(HEADROOM_SETTINGS_DIR, "settings.json");

/** Host runtime this extension is loaded into. */
export type HeadroomHost = "omp" | "pi";

/**
 * omp's ExtensionAPI exposes `zod`; pi's does not. Both hosts load this same
 * file, so host detection decides settings location only.
 */
export function detectHeadroomHost(api: unknown): HeadroomHost {
	return api && typeof (api as { zod?: unknown }).zod !== "undefined" ? "omp" : "pi";
}

function expandHome(raw: string): string {
	return raw.replace(/^~(?=\/|$)/, os.homedir());
}

/**
 * Resolve the settings file for a host.
 * `PI_HEADROOM_SETTINGS` (exact file) → `PI_CODING_AGENT_DIR` (omp + pi honour it)
 * → host agent dir (`~/.omp/agent` for omp, `~/.pi/agent` for pi).
 */
export function resolveHeadroomSettingsFile(host: HeadroomHost, env: NodeJS.ProcessEnv = process.env): string {
	const explicit = env.PI_HEADROOM_SETTINGS?.trim();
	if (explicit) return path.resolve(expandHome(explicit));

	const agentDir = env.PI_CODING_AGENT_DIR?.trim();
	if (agentDir) return path.join(expandHome(agentDir), "headroom", "settings.json");

	const agentRoot = host === "omp" ? path.join(os.homedir(), ".omp", "agent") : path.join(os.homedir(), ".pi", "agent");
	return path.join(agentRoot, "headroom", "settings.json");
}

export interface HeadroomSettings {
	enabled?: boolean | string;
	baseUrl?: string;
	url?: string;
	allowRemote?: boolean | string;
	mode?: string;
	silent?: boolean | string;
	renameToolCalls?: boolean | string;
	minContextTokens?: number | string;
	minMessageChars?: number | string;
	timeoutMs?: number | string;
}

export function loadHeadroomSettings(settingsPath: string = HEADROOM_SETTINGS_FILE): HeadroomSettings {
	try {
		const raw = fs.readFileSync(settingsPath, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as HeadroomSettings;
	} catch {
		// Missing or invalid settings.json falls back to env/defaults.
	}
	return {};
}

export function saveHeadroomSettings(
	patch: Partial<HeadroomSettings>,
	settingsPath: string = HEADROOM_SETTINGS_FILE,
): void {
	const current = loadHeadroomSettings(settingsPath);
	const updated = { ...current, ...patch };
	try {
		fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
		fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
	} catch (error) {
		console.warn(`[pi-headroom] Failed to save settings to ${settingsPath}:`, error);
	}
}

export function loadHeadroomConfig(
	env: NodeJS.ProcessEnv = process.env,
	settings?: HeadroomSettings,
	host: HeadroomHost = "pi",
): HeadroomConfig {
	const resolvedSettings =
		settings ?? (env === process.env ? loadHeadroomSettings(resolveHeadroomSettingsFile(host, env)) : {});
	const envBaseUrl = env.PI_HEADROOM_URL || env.HEADROOM_URL || env.HEADROOM_BASE_URL || DEFAULT_BASE_URL;
	const baseUrl = normalizeBaseUrl(parseString(resolvedSettings.baseUrl ?? resolvedSettings.url, envBaseUrl));
	return {
		enabled: parseBoolean(resolvedSettings.enabled, parseBoolean(env.PI_HEADROOM_ENABLED, true)),
		baseUrl,
		allowRemote: parseBoolean(resolvedSettings.allowRemote, parseBoolean(env.PI_HEADROOM_ALLOW_REMOTE, false)),
		renameToolCalls: parseBoolean(
			resolvedSettings.renameToolCalls,
			parseBoolean(env.PI_HEADROOM_RENAME_TOOL_CALLS, true),
		),
		mode: parseMode(
			resolvedSettings.mode,
			env.PI_HEADROOM_MODE,
			parseBoolean(resolvedSettings.silent, parseBoolean(env.PI_HEADROOM_SILENT, false)) ? "silent" : "normal",
		),
		minContextTokens: parseInteger(
			resolvedSettings.minContextTokens,
			parseInteger(env.PI_HEADROOM_MIN_CONTEXT_TOKENS, DEFAULT_MIN_CONTEXT_TOKENS, 0),
			0,
		),
		minMessageChars: parseInteger(
			resolvedSettings.minMessageChars,
			parseInteger(env.PI_HEADROOM_MIN_MESSAGE_CHARS, DEFAULT_MIN_MESSAGE_CHARS, 1),
			1,
		),
		timeoutMs: parseInteger(
			resolvedSettings.timeoutMs,
			parseInteger(env.PI_HEADROOM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 100),
			100,
		),
	};
}

export function isLocalHeadroomUrl(rawUrl: string): boolean {
	try {
		const url = new URL(rawUrl);
		return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
	} catch {
		return false;
	}
}

export function isRemoteBlocked(config: Pick<HeadroomConfig, "baseUrl" | "allowRemote">): boolean {
	return !config.allowRemote && !isLocalHeadroomUrl(config.baseUrl);
}

function normalizeBaseUrl(raw: string): string {
	const trimmed = raw.trim() || DEFAULT_BASE_URL;
	return trimmed.replace(/\/+$/, "");
}

function parseString(raw: unknown, fallback: string): string {
	if (typeof raw !== "string") return fallback;
	return raw.trim() || fallback;
}

function parseBoolean(raw: unknown, fallback: boolean): boolean {
	if (raw === undefined) return fallback;
	if (typeof raw === "boolean") return raw;
	if (typeof raw !== "string") return fallback;
	const normalized = raw.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return fallback;
}

function parseInteger(raw: unknown, fallback: number, min: number): number {
	if (raw === undefined) return fallback;
	const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
	if (!Number.isFinite(parsed) || parsed < min) return fallback;
	return Math.trunc(parsed);
}

const HEADROOM_MODES: HeadroomMode[] = ["normal", "quiet", "silent"];

function parseMode(raw: unknown, envRaw: string | undefined, fallback: HeadroomMode): HeadroomMode {
	const normalize = (v: unknown): HeadroomMode | null => {
		if (typeof v !== "string") return null;
		const s = v.trim().toLowerCase() as HeadroomMode;
		return HEADROOM_MODES.includes(s) ? s : null;
	};
	return normalize(raw) ?? normalize(envRaw) ?? fallback;
}
