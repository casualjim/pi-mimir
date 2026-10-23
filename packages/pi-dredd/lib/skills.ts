/**
 * Skill picker: name the skills the conversation needs, and notice when the
 * topic changes. One judge pass per user prompt scores every candidate, in
 * parallel batches of the operator-verified size: a noul fit score per
 * candidate, plus a topic-switch noul. No arbitrary cap and no choice rubric:
 * per-question isolation means a hundred skills get a hundred independent fit
 * probabilities instead of fighting over one distribution. The best-scoring
 * candidate steers the agent when it clears the fit floor; a real topic
 * switch drives auto-compact.
 */
import { readFileSync } from "node:fs";
import { ask, type Questions } from "./jev";
import type { DreddConfig } from "./settings";

/** A skill candidate as the picker sees it. */
export interface SkillCandidate {
	name: string;
	description: string;
	/** SKILL.md path when the host surface provides it; enables injecting the body as a forced skill. */
	filePath?: string;
}

export interface PickResult {
	/** The chosen skill name, or undefined when none cleared the floor. */
	skill: string | undefined;
	/** The chosen skill's fit score. */
	confidence: number;
	/** Judge's word on whether the topic changed from the last prompt. */
	switched: boolean;
	switchScore: number;
	/** Where the decision came from. */
	source: "judge" | "error";
	/** Present only on the error path; the caller records it. */
	error?: string;
}

/** Questions per batch: the option count the operator verified live against the running server. */
export const BATCH_SIZE = 26;
/** A candidate steers only at or above this fit score. */
export const FIT_FLOOR = 0.7;
/** Ceiling on the per-batch budget: a slow judge must not stall the turn. */
export const MAX_PICK_TIMEOUT_MS = 15_000;

/** One fit question per candidate in the batch, plus the topic-switch noul. */
export function pickQuestions(batch: readonly SkillCandidate[]): Questions {
	const questions: Questions = { switched: { type: "noul", instructions: "Does this request start a different task or topic than the previous one?" } };
	batch.forEach((candidate, index) => {
		questions[`fit${index}`] = {
			type: "noul",
			instructions: `Skill "${candidate.name}": ${candidate.description}. Does the request in the state need this skill?`,
		};
	});
	return questions;
}

/** Local lexical rank: prompt terms vs. skill name and description. Orders batches so the strongest go out first. */
export function rankCandidates(prompt: string, candidates: readonly SkillCandidate[]): SkillCandidate[] {
	const terms = new Set(prompt.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2));
	const score = (candidate: SkillCandidate): number => {
		const words = `${candidate.name} ${candidate.description}`.toLowerCase().split(/[^a-z0-9]+/);
		let hits = 0;
		for (const word of words) {
			if (terms.has(word)) hits++;
		}
		return hits;
	};
	return [...candidates].sort((a, b) => score(b) - score(a));
}

/** The candidate each fit answer index refers to, aligned with pickQuestions. */
function batchAnswer(batch: readonly SkillCandidate[], answers: Record<string, { type: string; noul?: number }>, index: number): { candidate: SkillCandidate; score: number } | undefined {
	const answer = answers[`fit${index}`];
	if (answer?.type !== "noul" || typeof answer.noul !== "number" || !Number.isFinite(answer.noul)) return undefined;
	return { candidate: batch[index] as SkillCandidate, score: answer.noul };
}

/**
 * Pick the skill and read the topic switch. Every candidate is judged in
 * batches of BATCH_SIZE fired concurrently; the switch question rides the
 * first batch. Fail-open: an error picks none and reports switched=false,
 * never blocking the turn.
 */
export async function pickSkill(
	config: DreddConfig,
	prompt: string,
	previousPrompt: string | undefined,
	candidates: readonly SkillCandidate[],
	env: NodeJS.ProcessEnv,
	fetchImpl: typeof fetch,
): Promise<PickResult> {
	if (candidates.length === 0) {
		return { skill: undefined, confidence: 0, switched: previousPrompt !== undefined, switchScore: 0, source: "judge" };
	}
	const ranked = rankCandidates(prompt, candidates);
	const batches: SkillCandidate[][] = [];
	for (let i = 0; i < ranked.length; i += BATCH_SIZE) {
		batches.push(ranked.slice(i, i + BATCH_SIZE));
	}
	const state = { prompt: prompt.slice(0, 1000), previousPrompt: previousPrompt?.slice(0, 500) ?? "" };
	const stateFirst = { prompt: prompt.slice(0, 1000), previousPrompt: previousPrompt?.slice(0, 500) ?? "", isFirstBatch: true };
	// The judge serializes requests, so N batches need ~N * timeoutMs; the
	// old shared single timeout aborted all of them at once.
	const budgetMs = Math.min(config.timeoutMs * batches.length, MAX_PICK_TIMEOUT_MS);
	const askOptions = { backend: config.backend, apiKey: config.apiKey, model: config.model, timeoutMs: budgetMs, keyResolver: config.keyResolver };
	// Settled, not all: one failed batch must not discard the batches that answered.
	const settled = await Promise.allSettled(
		batches.map((batch, batchIndex) => ask(askOptions, batchIndex === 0 ? stateFirst : state, pickQuestions(batch), env, fetchImpl)),
	);
	let best: { candidate: SkillCandidate; score: number } | undefined;
	let switchScore = 0;
	let failure: string | undefined;
	settled.forEach((outcome, batchIndex) => {
		if (outcome.status === "rejected") {
			failure ??= outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
			return;
		}
		if (batchIndex === 0) {
			const switched = outcome.value.answers.switched;
			if (switched?.type === "noul") switchScore = switched.noul;
		}
		const batch = batches[batchIndex] ?? [];
		for (let i = 0; i < batch.length; i++) {
			const scored = batchAnswer(batch, outcome.value.answers, i);
			if (scored && (!best || scored.score > best.score)) best = scored;
		}
	});
	const cleared = best && best.score >= FIT_FLOOR ? best : undefined;
	if (cleared) {
		return { skill: cleared.candidate.name, confidence: cleared.score, switched: switchScore >= 0.7, switchScore, source: "judge" };
	}
	return {
		skill: undefined,
		confidence: 0,
		switched: switchScore >= 0.7,
		switchScore,
		source: failure === undefined ? "judge" : "error",
		error: failure,
	};
}

/** The forced-skill message: the skill's own body, injected the way a user
 * invocation injects it, so the instructions are in-context and binding
 * rather than a pointer the agent may skip. */
export function forcedSkillMessage(result: PickResult, body: string): string {
	return `pi-dredd: the skill "${result.skill}" fits this request (confidence ${result.confidence.toFixed(2)}). Apply these instructions for this request.\n\n${body.trim()}`;
}

/** The steer text the agent reads when the skill's file is unavailable. */
export function skillSteer(result: PickResult): string | undefined {
	if (result.skill === undefined) return undefined;
	return `pi-dredd: the skill "${result.skill}" fits this request (confidence ${result.confidence.toFixed(2)}). Use it rather than rediscovering the procedure.`;
}

/** The SKILL.md body with frontmatter stripped; the whole file when the
 * frontmatter block is absent or malformed. */
export function skillBody(filePath: string): string {
	const content = readFileSync(filePath, "utf-8");
	if (!content.startsWith("---")) return content;
	const end = content.indexOf("\n---", 3);
	return end === -1 ? content : content.slice(end + 4);
}
