/**
 * Speed tier: the router picks an effort tier per request from the prompt
 * (ohmyjev ROUTE_Q shape), auto-compact fires once a new task starts while
 * the context is part-full, and ask_jev hands the agent direct typed
 * judgments without reading files into context.
 */
import { ask, type Questions } from "./jev";
import type { DreddConfig } from "./settings";

/** The router tiers; the config maps each to a concrete model. */
export const TIERS = ["fast", "balanced", "deep"] as const;
export type Tier = (typeof TIERS)[number];

export function routeQuestions(): Questions {
	return {
		effort: {
			type: "score",
			instructions: "How much thinking does this request need?",
			criteria: ["A quick lookup or mechanical edit", "Ordinary feature work", "Deep design, debugging, or architecture"],
		},
	};
}

/** A prompt is a new task when it is not a short continuation of the last one. */
export function isNewTask(prompt: string, lastPrompt: string | undefined): boolean {
	if (lastPrompt === undefined) return true;
	if (prompt.trim().length > 400) return true;
	const continuation = /^(?:yes|no|ok|go|continue|next|y|n)\b/i.test(prompt.trim());
	return !continuation;
}

/** Map the effort score to a tier: 0 fast, 1 balanced, 2 deep. */
export function tierOf(score: number): Tier {
	return score <= 0.5 ? "fast" : score < 1.5 ? "balanced" : "deep";
}

export interface RouteDecision {
	tier: Tier;
	/** Model from config.tiers when set, else undefined (the host model stands). */
	model?: string;
}

export interface RouterConfig {
	/** tier -> model id; absent tiers keep the host model. */
	tiers?: Partial<Record<Tier, string>>;
}

/**
 * One route decision. Fail-open: no key or error leaves the model alone and
 * returns balanced.
 */
export async function decideRoute(
	config: DreddConfig & { router?: RouterConfig },
	prompt: string,
	env: NodeJS.ProcessEnv,
	fetchImpl: typeof fetch,
): Promise<RouteDecision> {
	try {
		const result = await ask(
			{ backend: config.backend, apiKey: config.apiKey, model: config.model, timeoutMs: config.timeoutMs, keyResolver: config.keyResolver },
			{ prompt: prompt.slice(0, 1000) },
			routeQuestions(),
			env,
			fetchImpl,
		);
		const effort = result.answers.effort;
		const tier = effort?.type === "score" ? tierOf(effort.score) : "balanced";
		return { tier, model: config.router?.tiers?.[tier] };
	} catch {
		return { tier: "balanced" };
	}
}

/** Auto-compact threshold: fire when the context is at least this full. */
export const COMPACT_MIN_PERCENT = 40;

/** ask_jev: the agent asks one typed question batch about state it names. */
export async function askJev(
	config: DreddConfig,
	state: Record<string, unknown>,
	questions: Questions,
	env: NodeJS.ProcessEnv,
	fetchImpl: typeof fetch,
): Promise<{ ok: true; answers: Record<string, unknown>; inputTokens: number } | { ok: false; error: string }> {
	try {
		const result = await ask(
			{ backend: config.backend, apiKey: config.apiKey, model: config.model, timeoutMs: Math.max(config.timeoutMs, 10_000), keyResolver: config.keyResolver },
			state,
			questions,
			env,
			fetchImpl,
		);
		return { ok: true, answers: result.answers, inputTokens: result.inputTokens };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}