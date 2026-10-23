/**
 * pi-dredd settings resolution, following the pi-headroom pattern:
 * PI_DREDD_SETTINGS (exact file) -> PI_CODING_AGENT_DIR/dredd/settings.json
 * -> host default (~/.omp/agent under omp, ~/.pi/agent under pi).
 * Host detection: omp's ExtensionAPI exposes `zod`; pi's does not.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CustomBackend, KeyResolver } from "./jev";

export type DreddHost = "omp" | "pi";

export function detectDreddHost(api: unknown): DreddHost {
	return api && typeof (api as { zod?: unknown }).zod !== "undefined" ? "omp" : "pi";
}

function expandHome(raw: string): string {
	return raw.replace(/^~(?=\/|$)/, os.homedir());
}

export function resolveSettingsFile(host: DreddHost, env: NodeJS.ProcessEnv = process.env): string {
	const explicit = env.PI_DREDD_SETTINGS?.trim();
	if (explicit) return path.resolve(expandHome(explicit));
	const agentDir = env.PI_CODING_AGENT_DIR?.trim();
	if (agentDir) return path.join(expandHome(agentDir), "dredd", "settings.json");
	const agentRoot = host === "omp" ? path.join(os.homedir(), ".omp", "agent") : path.join(os.homedir(), ".pi", "agent");
	return path.join(agentRoot, "dredd", "settings.json");
}

/** The capture preset: how aggressively issues are recorded and surfaced. */
export type CapturePreset = "strict" | "balanced" | "recall";

/** A user-registered question riding the gate's judge request. */
export interface RegisteredQuestion {
	id: string;
	type: "noul" | "score" | "choice";
	instructions: string;
	/** choice: label -> when-it-applies; score: ordered levels. */
	criteria?: Record<string, string> | string[];
	/** Answer at or above this probability/score counts as a violation. */
	threshold: number;
	/** Where the question applies: "call" (guarded tool calls), "output" (tool results), "reply" (final messages). */
	appliesTo: "call" | "output" | "reply";
}

export interface DreddSettings {
	enabled?: boolean;
	/** Registry name or custom endpoint object; default "typesafe". */
	backend?: string | CustomBackend;
	apiKey?: string;
	model?: string;
	timeoutMs?: number;
	capture?: CapturePreset;
	/** User-registered questions extending the built-in taxonomy. */
	questions?: RegisteredQuestion[];
	/** Plain-English policies compiled into judge questions riding every gate. */
	policies?: string[];
	/** Set when the settings file exists but could not be read or parsed; reported by /dredd status. */
	loadError?: string;
}

function parseBoolean(raw: unknown, fallback: boolean): boolean {
	if (raw === true || raw === "true") return true;
	if (raw === false || raw === "false") return false;
	return fallback;
}

function parsePreset(raw: unknown, fallback: CapturePreset): CapturePreset {
	return raw === "strict" || raw === "balanced" || raw === "recall" ? raw : fallback;
}

function parseIntBounded(raw: unknown, fallback: number, min: number, max: number): number {
	const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
	return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function parseQuestion(raw: unknown): RegisteredQuestion | undefined {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const q = raw as Record<string, unknown>;
	const id = typeof q.id === "string" && /^[a-z][a-zA-Z0-9_]*$/.test(q.id) ? q.id : undefined;
	const type = q.type === "noul" || q.type === "score" || q.type === "choice" ? q.type : undefined;
	const instructions = typeof q.instructions === "string" && q.instructions.trim().length > 0 ? q.instructions.trim() : undefined;
	const threshold = Number(q.threshold);
	const appliesTo = q.appliesTo === "call" || q.appliesTo === "output" || q.appliesTo === "reply" ? q.appliesTo : undefined;
	if (!id || !type || !instructions || !Number.isFinite(threshold) || threshold < 0 || threshold > 1 || !appliesTo) return undefined;
	if (type === "noul") return { id, type, instructions, threshold, appliesTo };
	if (type === "choice") {
		if (!q.criteria || typeof q.criteria !== "object" || Array.isArray(q.criteria)) return undefined;
		const criteria: Record<string, string> = {};
		for (const [label, when] of Object.entries(q.criteria)) {
			if (typeof when !== "string" || !/^[a-z][a-zA-Z0-9_]*$/.test(label)) return undefined;
			criteria[label] = when;
		}
		return { id, type, instructions, criteria, threshold, appliesTo };
	}
	if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 32 || q.criteria.some(c => typeof c !== "string")) return undefined;
	return { id, type, instructions, criteria: q.criteria as string[], threshold, appliesTo };
}

export function parseQuestions(raw: unknown): RegisteredQuestion[] {
	if (!Array.isArray(raw)) return [];
	const parsed = raw.map(parseQuestion).filter((q): q is RegisteredQuestion => q !== undefined);
	const seen = new Set<string>();
	const unique: RegisteredQuestion[] = [];
	for (const q of parsed) {
		if (seen.has(q.id)) continue;
		seen.add(q.id);
		unique.push(q);
	}
	return unique;
}

export function parsePolicies(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map(p => p.trim());
}

export function loadSettings(settingsPath: string): DreddSettings {
	try {
		const raw = fs.readFileSync(settingsPath, "utf-8");
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const s = parsed as Record<string, unknown>;
		return {
			enabled: parseBoolean(s.enabled, true),
			backend:
				typeof s.backend === "string"
					? s.backend
					: s.backend && typeof s.backend === "object" && !Array.isArray(s.backend)
						? (s.backend as CustomBackend)
						: undefined,
			apiKey: typeof s.apiKey === "string" && s.apiKey.length > 0 ? s.apiKey : undefined,
			model: typeof s.model === "string" && s.model.length > 0 ? s.model : undefined,
			timeoutMs: parseIntBounded(s.timeoutMs, 1500, 100, 30000),
			capture: parsePreset(s.capture, "balanced"),
			questions: parseQuestions(s.questions),
			policies: parsePolicies(s.policies),
		};
	} catch (error) {
		return { loadError: `settings unreadable (${settingsPath}): ${error instanceof Error ? error.message : String(error)}` };
	}
}

/** The effective runtime config: settings overlaid on defaults. */
export interface RouterConfig {
	/** tier -> model id; absent tiers keep the host model. */
	tiers?: Partial<Record<"fast" | "balanced" | "deep", string>>;
	/** Route the main model too; off by default because it drops the prompt cache. */
	routeMainModel?: boolean;
}

export interface DreddConfig {
	enabled: boolean;
	backend: string | CustomBackend;
	apiKey?: string;
	model?: string;
	timeoutMs: number;
	capture: CapturePreset;
	questions: RegisteredQuestion[];
	policies: string[];
	/** Set when the settings file exists but could not be read or parsed. */
	loadError?: string;
	router?: RouterConfig;
	/** Set by the extension at session start: the host's credential lookup. */
	keyResolver?: KeyResolver;
}

export function effectiveConfig(settings: DreddSettings): DreddConfig {
	return {
		enabled: settings.enabled ?? true,
		backend: settings.backend ?? "typesafe",
		apiKey: settings.apiKey,
		model: settings.model,
		timeoutMs: settings.timeoutMs ?? 1500,
		capture: settings.capture ?? "balanced",
		questions: settings.questions ?? [],
		policies: settings.policies ?? [],
		loadError: settings.loadError,
	};
}