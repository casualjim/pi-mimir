import { describe, expect, it } from "vitest";
import { askJev, decideRoute, isNewTask, tierOf, COMPACT_MIN_PERCENT } from "../lib/speed";
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

const judgeFetch = (score: number): typeof fetch =>
	(async (_url: unknown, init?: { body?: unknown }) => {
		const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string }> };
		const answers: Record<string, unknown> = {};
		for (const [id, q] of Object.entries(body.questions)) {
			answers[id] = q.type === "score" ? { type: "score", score } : { type: "noul", noul: 0.5 };
		}
		return new Response(JSON.stringify({ answers, usage: { input_tokens: 10 } }), { status: 200 });
	}) as unknown as typeof fetch;

describe("isNewTask", () => {
	it("a first prompt is a new task", () => {
		expect(isNewTask("build the thing", undefined)).toBe(true);
	});

	it("short continuations are not new tasks", () => {
		expect(isNewTask("yes go on", "build the thing")).toBe(false);
		expect(isNewTask("continue", "build the thing")).toBe(false);
	});

	it("a long reply or fresh subject is a new task", () => {
		expect(isNewTask("x".repeat(401), "build the thing")).toBe(true);
		expect(isNewTask("now refactor the auth layer", "build the thing")).toBe(true);
	});
});

describe("tierOf", () => {
	it("maps scores to tiers", () => {
		expect(tierOf(0)).toBe("fast");
		expect(tierOf(1)).toBe("balanced");
		expect(tierOf(2)).toBe("deep");
	});
});

describe("decideRoute", () => {
	it("routes a deep request to the configured deep model", async () => {
		const cfg = config({ ...{}, router: { tiers: { deep: "provider/big-model" } } });
		const decision = await decideRoute(cfg, "design a new storage engine", { LOCAL_JUDGE_KEY: "k" }, judgeFetch(2));
		expect(decision.tier).toBe("deep");
		expect(decision.model).toBe("provider/big-model");
	});

	it("routes a mechanical request to the fast model", async () => {
		const cfg = config({ ...{}, router: { tiers: { fast: "provider/cheap-model" } } });
		const decision = await decideRoute(cfg, "rename this variable", { LOCAL_JUDGE_KEY: "k" }, judgeFetch(0));
		expect(decision.tier).toBe("fast");
		expect(decision.model).toBe("provider/cheap-model");
	});

	it("fails open to balanced with no tier model", async () => {
		const cfg = config();
		const failing: typeof fetch = (async () => {
			throw new Error("down");
		}) as unknown as typeof fetch;
		const decision = await decideRoute(cfg, "anything", { LOCAL_JUDGE_KEY: "k" }, failing);
		expect(decision.tier).toBe("balanced");
		expect(decision.model).toBeUndefined();
	});
});

describe("askJev", () => {
	it("returns answers on success", async () => {
		const cfg = config();
		const result = await askJev(
			cfg,
			{ report: "login fails after update" },
			{ urgent: { type: "noul", instructions: "Does the sender request help today?" } },
			{ LOCAL_JUDGE_KEY: "k" },
			judgeFetch(0),
		);
		expect(result.ok).toBe(true);
	});

	it("returns the error text on failure", async () => {
		const cfg = config();
		const failing: typeof fetch = (async () => {
			throw new Error("no route");
		}) as unknown as typeof fetch;
		const result = await askJev(cfg, {}, { q: { type: "noul", instructions: "?" } }, { LOCAL_JUDGE_KEY: "k" }, failing);
		expect(result.ok).toBe(false);
	});
});

describe("COMPACT_MIN_PERCENT", () => {
	it("keeps ohmyjev's default", () => {
		expect(COMPACT_MIN_PERCENT).toBe(40);
	});
});