/**
 * config — persisted advisor config (~/.config/pi-mimir-advisor/advisor.json)
 * plus local provider/model key codec and guidance validation.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import { EFFORT_ORDINAL } from "./messages";

export interface GuidanceFields {
	promptSnippet?: string;
	promptGuidelines?: string[];
}

export type DisabledForModelsEntry = string | { model: string; minEffort?: ThinkingLevel };

interface AdvisorConfig {
	modelKey?: string;
	effort?: ThinkingLevel;
	guidance?: GuidanceFields;
	disabledForModels?: DisabledForModelsEntry[];
}

function advisorConfigPath(): string {
	return join(homedir(), ".config", "pi-mimir-advisor", "advisor.json");
}

function ensureConfigDir(): void {
	mkdirSync(dirname(advisorConfigPath()), { recursive: true });
}

export function modelKey(model: Pick<Model<Api>, "provider" | "id">): string {
	return `${model.provider}/${model.id}`;
}

export function parseModelKey(key: string): { provider: string; modelId: string } | undefined {
	const slashIdx = key.indexOf("/");
	if (slashIdx > 0) return { provider: key.slice(0, slashIdx), modelId: key.slice(slashIdx + 1) };
	const colonIdx = key.indexOf(":");
	if (colonIdx > 0) return { provider: key.slice(0, colonIdx), modelId: key.slice(colonIdx + 1) };
	return undefined;
}

export function validateGuidanceFields(value: unknown): GuidanceFields {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const obj = value as Record<string, unknown>;
	const out: GuidanceFields = {};
	if (typeof obj.promptSnippet === "string" && obj.promptSnippet.trim().length > 0) {
		out.promptSnippet = obj.promptSnippet;
	}
	if (Array.isArray(obj.promptGuidelines)) {
		const promptGuidelines = obj.promptGuidelines.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
		if (promptGuidelines.length > 0) out.promptGuidelines = promptGuidelines;
	}
	return out;
}

export function loadAdvisorConfig(): AdvisorConfig {
	const configPath = advisorConfigPath();
	if (!existsSync(configPath)) return {};
	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as AdvisorConfig) : {};
	} catch {
		return {};
	}
}

export function validateDisabledForModels(value: unknown): DisabledForModelsEntry[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is DisabledForModelsEntry => {
		if (typeof entry === "string") return entry.length > 0;
		if (typeof entry !== "object" || entry === null) return false;
		const obj = entry as Record<string, unknown>;
		if (typeof obj.model !== "string" || obj.model.length === 0) return false;
		if (obj.minEffort !== undefined && !EFFORT_ORDINAL.includes(obj.minEffort as ThinkingLevel)) return false;
		return true;
	});
}

export function saveAdvisorConfig(key: string | undefined, effort: ThinkingLevel | undefined): boolean {
	const existing = loadAdvisorConfig();
	const config: AdvisorConfig = { ...existing };
	if (key) config.modelKey = key;
	else delete config.modelKey;
	if (effort) config.effort = effort;
	else delete config.effort;
	try {
		ensureConfigDir();
		const configPath = advisorConfigPath();
		writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
		try {
			chmodSync(configPath, 0o600);
		} catch {
			// Best effort only.
		}
		return true;
	} catch {
		return false;
	}
}
