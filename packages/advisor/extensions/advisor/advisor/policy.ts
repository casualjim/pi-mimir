/**
 * policy — the disabledForModels blocklist (cache + setter) and the predicates
 * that decide whether the advisor tool is blocked for a given model/effort.
 */

import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { modelKey, parseModelKey, type DisabledForModelsEntry } from "./config";
import { EFFORT_ORDINAL } from "./messages";

let disabledForModelsCache: DisabledForModelsEntry[] = [];

export function setDisabledForModels(models: DisabledForModelsEntry[]): void {
	disabledForModelsCache = models;
}

/**
 * Normalise a stored blocklist entry's model key to the canonical slash form.
 * Tolerates legacy colon-form persisted lists so `disabledForModels:
 * ["anthropic:sonnet"]` keeps blocking post-slash-canonical-migration without
 * requiring a re-save. Pass-through for already-canonical (slash) values and
 * for malformed input.
 */
function canonicalKey(entry: string): string {
	const parsed = parseModelKey(entry);
	return parsed ? `${parsed.provider}/${parsed.modelId}` : entry;
}

export function isModelBlocked(model: Model<Api> | undefined, thinkingLevel?: string): boolean {
	if (!model) return false;
	const key = modelKey(model);
	for (const entry of disabledForModelsCache) {
		if (typeof entry === "string") {
			if (canonicalKey(entry) === key) return true;
		} else {
			if (canonicalKey(entry.model) !== key) continue;
			if (entry.minEffort === undefined) return true;
			const thresholdOrdinal = EFFORT_ORDINAL.indexOf(entry.minEffort);
			const executorOrdinal = EFFORT_ORDINAL.indexOf(thinkingLevel as ThinkingLevel);
			if (executorOrdinal >= thresholdOrdinal) return true;
		}
	}
	return false;
}

export function isExecutorBlocked(ctx: ExtensionContext, thinkingLevel?: string): boolean {
	return isModelBlocked(ctx?.model, thinkingLevel);
}
