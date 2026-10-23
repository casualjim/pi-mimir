import { describe, expect, it, vi } from "vitest";
import { BATCH_SIZE, FIT_FLOOR, forcedSkillMessage, pickQuestions, pickSkill, rankCandidates, skillSteer } from "../lib/skills";
import type { DreddConfig } from "../lib/settings";

const config = (overrides: Partial<DreddConfig> = {}): DreddConfig => ({
	enabled: true,
	backend: { label: "local", host: "http://localhost:1", keyEnv: "LOCAL_JUDGE_KEY", defaultModel: "test-model" },
	timeoutMs: 500,
	capture: "balanced",
	questions: [],
	policies: [],
	...overrides,
});

const CANDIDATES = [
	{ name: "rust-design-patterns", description: "Writing, reviewing, or debugging Rust; borrow checker, lifetimes, API design." },
	{ name: "tavily-search", description: "Web search, finding articles, latest news, current information." },
];

/**
 * A fetch double: the judge scores fit per candidate name (default 0.02),
 * reports the topic switch at switchScore, and records the batch shapes.
 */
function judgeFetch(fitScores: Record<string, number>, switchScore: number): typeof fetch {
	return (async (_url: unknown, init?: { body?: unknown }) => {
		const body = JSON.parse(String(init?.body)) as { state: { prompt: string; previousPrompt?: string; isFirstBatch?: boolean }; questions: Record<string, { type: string; instructions?: string }> };
		const answers: Record<string, unknown> = {};
		for (const [id, q] of Object.entries(body.questions)) {
			if (q.type === "noul" && id === "switched") {
				answers[id] = { type: "noul", noul: body.state.previousPrompt !== undefined ? switchScore : 0.02 };
				continue;
			}
			const nameMatch = /Skill "([^"]+)"/.exec(q.instructions ?? "");
			const name = nameMatch?.[1] ?? "";
			answers[id] = { type: "noul", noul: fitScores[name] ?? 0.02 };
		}
		return new Response(JSON.stringify({ answers, usage: { input_tokens: 10 } }), { status: 200 });
	}) as unknown as typeof fetch;
}

describe("pickQuestions", () => {
	it("asks one fit question per candidate plus a switch question", () => {
		const questions = pickQuestions(CANDIDATES);
		expect(Object.keys(questions).sort()).toEqual(["fit0", "fit1", "switched"]);
		expect(questions.fit0?.type).toBe("noul");
		expect(questions.fit0).toMatchObject({ instructions: expect.stringContaining("rust-design-patterns") });
		expect(questions.switched?.type).toBe("noul");
	});
});

describe("pickSkill", () => {
	it("picks the best fit above the floor and reads a topic switch", async () => {
		const result = await pickSkill(config(), "review this borrow checker error", "deploy to prod", CANDIDATES, { LOCAL_JUDGE_KEY: "k" }, judgeFetch({ "rust-design-patterns": 0.93 }, 0.8));
		expect(result.source).toBe("judge");
		expect(result.skill).toBe("rust-design-patterns");
		expect(result.confidence).toBe(0.93);
		expect(result.switched).toBe(true);
	});

	it("picks nothing when no candidate clears the floor", async () => {
		const result = await pickSkill(config(), "what's for dinner", "deploy to prod", CANDIDATES, { LOCAL_JUDGE_KEY: "k" }, judgeFetch({}, 0.6));
		expect(result.skill).toBeUndefined();
		expect(result.switched).toBe(false);
	});

	it("a low switch score is not a switch", async () => {
		const result = await pickSkill(config(), "and also run the tests", "run the tests", CANDIDATES, { LOCAL_JUDGE_KEY: "k" }, judgeFetch({ "tavily-search": 0.8 }, 0.2));
		expect(result.switched).toBe(false);
	});

	it("judges a 100-skill catalog in concurrent batches without dropping anyone", async () => {
		const catalog = Array.from({ length: 100 }, (_, i) => ({ name: `skill-${i}`, description: `skill number ${i}` }));
		catalog.push({ name: "rust-design-patterns", description: "Rust borrow checker, lifetimes, API design." });
		const observedBatches: number[] = [];
		const observedOptions: string[] = [];
		const capturing: typeof fetch = (async (_url: unknown, init?: { body?: unknown }) => {
			const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string; instructions?: string }> };
			observedBatches.push(Object.keys(body.questions).filter(id => id.startsWith("fit")).length);
			for (const q of Object.values(body.questions)) {
				const nameMatch = /Skill "([^"]+)"/.exec(q.instructions ?? "");
				if (nameMatch?.[1]) observedOptions.push(nameMatch[1]);
			}
			const answers: Record<string, unknown> = {};
			for (const [id, q] of Object.entries(body.questions)) {
				const nameMatch = /Skill "([^"]+)"/.exec(q.instructions ?? "");
				answers[id] = { type: "noul", noul: nameMatch?.[1] === "rust-design-patterns" ? 0.91 : 0.01 };
			}
			return new Response(JSON.stringify({ answers, usage: { input_tokens: 10 } }), { status: 200 });
		}) as unknown as typeof fetch;
		const result = await pickSkill(config(), "review this borrow checker error", undefined, catalog, { LOCAL_JUDGE_KEY: "k" }, capturing);
		expect(observedBatches.length).toBe(4);
		expect(observedBatches[0]).toBe(BATCH_SIZE);
		expect(observedBatches.every(size => size <= BATCH_SIZE)).toBe(true);
		expect(new Set(observedOptions).size).toBe(101);
		expect(observedOptions).toContain("rust-design-patterns");
		expect(result.skill).toBe("rust-design-patterns");
	});

	it("a lexically invisible skill is still judged and can win", async () => {
		// The prompt shares no terms with the skill's name or description;
		// the single-stage choice+shortlist design dropped these silently.
		const result = await pickSkill(config(), "make the smallest diff that fully solves it", undefined, [{ name: "ponytail", description: "Lazy senior dev mode: smallest change that fully solves the task." }], { LOCAL_JUDGE_KEY: "k" }, judgeFetch({ ponytail: 0.95 }, 0.1));
		expect(result.skill).toBe("ponytail");
	});

	it("a batch that never answers does not discard the batches that did", async () => {
		// Live local judge serializes requests: batch k replies at ~k * the
		// single-request timeout, so a shared single budget aborted every
		// batch at once and a single rejection threw away the answers.
		vi.useFakeTimers();
		try {
			const catalog = Array.from({ length: 28 }, (_, i) => ({ name: `skill-${i}`, description: `skill number ${i}` }));
			catalog[0] = { name: "rust-design-patterns", description: "Rust borrow checker and lifetimes." };
			const timeoutMs = 30;
			const answering = (questions: Record<string, { instructions?: string }>): string => {
				const answers: Record<string, unknown> = {};
				for (const [id, q] of Object.entries(questions)) {
					const name = /Skill "([^"]+)"/.exec(q.instructions ?? "")?.[1] ?? "";
					answers[id] = { type: "noul", noul: name === "rust-design-patterns" ? 0.91 : 0.01 };
				}
				return JSON.stringify({ answers, usage: { input_tokens: 10 } });
			};
			const hangSecondBatch: typeof fetch = (async (_url: unknown, init?: { body?: unknown; signal?: AbortSignal }) => {
				const body = JSON.parse(String(init?.body)) as { questions: Record<string, { instructions?: string }> };
				const names = Object.values(body.questions).map(q => /Skill "([^"]+)"/.exec(q.instructions ?? "")?.[1] ?? "");
				if (names.includes("rust-design-patterns")) return new Response(answering(body.questions), { status: 200 });
				// Reject on the picker's own abort: awaiting the real signal beats a sleep.
				return new Promise<Response>((_resolve, reject) =>
					init?.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted.")), { once: true }),
				);
			}) as unknown as typeof fetch;
			const pending = pickSkill(config({ timeoutMs }), "review this borrow checker error", undefined, catalog, { LOCAL_JUDGE_KEY: "k" }, hangSecondBatch);
			await vi.advanceTimersByTimeAsync(timeoutMs * 2 + 1);
			const result = await pending;
			expect(result.source).toBe("judge");
			expect(result.skill).toBe("rust-design-patterns");
		} finally {
			vi.useRealTimers();
		}
	});

	it("fails open with the error text and no skill", async () => {
		const failing: typeof fetch = (async () => {
			throw new Error("connection refused");
		}) as unknown as typeof fetch;
		const result = await pickSkill(config(), "anything", undefined, CANDIDATES, { LOCAL_JUDGE_KEY: "k" }, failing);
		expect(result.source).toBe("error");
		expect(result.skill).toBeUndefined();
		expect(result.error).toContain("connection refused");
	});

	it("no candidates needs no request", async () => {
		let requested = 0;
		const counting: typeof fetch = (async () => {
			requested++;
			return new Response("{}", { status: 200 });
		}) as unknown as typeof fetch;
		const result = await pickSkill(config(), "anything", "earlier", [], { LOCAL_JUDGE_KEY: "k" }, counting);
		expect(result.skill).toBeUndefined();
		expect(requested).toBe(0);
	});
});

describe("rankCandidates", () => {
	it("orders by term overlap", () => {
		const ranked = rankCandidates("search the web for latest news", CANDIDATES);
		expect(ranked[0]?.name).toBe("tavily-search");
	});
});

describe("constants", () => {
	it("batch size is the operator-verified option count; fit floor gates steers", () => {
		expect(BATCH_SIZE).toBe(26);
		expect(FIT_FLOOR).toBe(0.7);
	});
});

describe("skillSteer", () => {
	it("names the skill and its fit score", () => {
		const steer = skillSteer({ skill: "tavily-search", confidence: 0.88, switched: false, switchScore: 0.1, source: "judge" });
		expect(steer).toContain("tavily-search");
		expect(steer).toContain("0.88");
	});

	it("stays silent with no skill", () => {
		expect(skillSteer({ skill: undefined, confidence: 0, switched: false, switchScore: 0, source: "judge" })).toBeUndefined();
	});
});

describe("forcedSkillMessage", () => {
	it("carries the skill body, not a pointer", () => {
		const message = forcedSkillMessage({ skill: "why", confidence: 0.92, switched: false, switchScore: 0, source: "judge" }, "# Why\n\nInvestigate with citations.");
		expect(message).toContain('"why"');
		expect(message).toContain("0.92");
		expect(message).toContain("Investigate with citations.");
		expect(message).toContain("Apply these instructions");
	});
});