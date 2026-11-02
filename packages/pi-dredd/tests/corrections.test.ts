import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntime, registerSpeed } from "../extensions/dredd";
import type { DreddConfig } from "../lib/settings";
import type { ModelSurface } from "../lib/normalize";

/**
 * A captured correction must end up in the lesson store as the normalized,
 * semantically verified rewrite — never the operator's raw sentence, and
 * never unverified. The host model is an outside service, so the compat
 * module is stubbed (the production path imports it dynamically) and the
 * decision backend's fetch is swapped; every assertion reads the store, the
 * persisted file, the ledger, or the visible notification back.
 */
const host = vi.hoisted(() => ({
	calls: [] as Array<{ model: { provider: string; id: string }; context: { messages?: Array<{ content: Array<{ text?: string }> }> } }>,
	replies: [] as unknown[],
}));

vi.mock("@earendil-works/pi-ai/compat", () => ({
	completeSimple: async (model: { provider: string; id: string }, context: { messages?: Array<{ content: Array<{ text?: string }> }> }) => {
		host.calls.push({ model, context });
		const next = host.replies.shift();
		if (next === undefined) throw new Error("test received an unexpected model call");
		if (next instanceof Error) throw next;
		return next;
	},
}));

const tiny = { provider: "test-provider", id: "tiny-1" };
const judge = { provider: "test-provider", id: "judge-1" };
const textReply = (text: string) => ({ stopReason: "stop", content: [{ type: "text", text }] });
const jsonReply = (value: unknown) => textReply(JSON.stringify(value));

const config = (overrides: Partial<DreddConfig> = {}): DreddConfig => ({
	enabled: true,
	backend: { label: "local", host: "http://localhost:1", path: "/v1/systemone", keyEnv: "LOCAL_JUDGE_KEY", defaultModel: "test-model" },
	timeoutMs: 500,
	capture: "balanced",
	questions: [],
	policies: [],
	...overrides,
});

/** Host model surface per test: @tiny is the rewrite model, @judge the
 * verifier role (absent on pi, which then verifies via the decision backend). */
const surface = (opts: { tiny?: boolean; judge?: boolean } = {}): ModelSurface => ({
	models: {
		resolve: (spec: string) => (spec === "@tiny" && opts.tiny !== false ? tiny : spec === "@judge" && opts.judge ? judge : undefined),
	},
	modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true as const, apiKey: "host-key" }) },
});

interface FakePiEvent {
	toolName: string;
	input: unknown;
	prompt?: string;
}

interface FakePiCtx extends ModelSurface {
	cwd: string;
	hasUI: boolean;
	ui: { notify: (text: string, level: string) => void };
	getContextUsage: () => { percent: number | null };
	compact: () => void;
}

interface FakePi {
	listeners: Array<{ event: string; handler: (event: FakePiEvent, ctx: FakePiCtx) => unknown }>;
	on: (event: string, handler: (event: FakePiEvent, ctx: FakePiCtx) => unknown) => void;
	registerTool: (tool: unknown) => void;
}

function fakePi(): FakePi {
	const listeners: FakePi["listeners"] = [];
	return {
		listeners,
		on: (event, handler) => listeners.push({ event, handler }),
		registerTool: () => {},
	};
}

function tempEnv() {
	const dir = mkdtempSync(join(tmpdir(), "dredd-correction-"));
	const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
	const oldKey = process.env.LOCAL_JUDGE_KEY;
	process.env.PI_CODING_AGENT_DIR = dir;
	process.env.LOCAL_JUDGE_KEY = "test-judge-key";
	return {
		dir,
		restore() {
			if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
			if (oldKey === undefined) delete process.env.LOCAL_JUDGE_KEY;
			else process.env.LOCAL_JUDGE_KEY = oldKey;
		},
	};
}

/** Decision-backend double: answers every noul question with the mapped
 * noul (default 0.02) and records which question ids each request asked. */
function judgeFetch(nouls: Record<string, number>, asked: string[][]): typeof fetch {
	return (async (_url: unknown, init?: { body?: unknown }) => {
		const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string }> };
		asked.push(Object.keys(body.questions));
		const answers: Record<string, unknown> = {};
		for (const [id, q] of Object.entries(body.questions)) {
			answers[id] = { type: q.type, noul: nouls[id] ?? 0.02 };
		}
		return new Response(JSON.stringify({ answers, usage: { input_tokens: 1 } }), { status: 200 });
	}) as unknown as typeof fetch;
}

interface SendOutcome {
	asked: string[][];
	notes: Array<{ text: string; level: string }>;
}

async function sendMessage(
	pi: FakePi,
	prompt: string,
	nouls: Record<string, number>,
	surf: ModelSurface | undefined,
): Promise<SendOutcome> {
	const handler = pi.listeners.find(l => l.event === "before_agent_start")?.handler;
	if (!handler) throw new Error("no before_agent_start handler registered");
	const asked: string[][] = [];
	const notes: Array<{ text: string; level: string }> = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = judgeFetch(nouls, asked);
	try {
		await handler(
			{ toolName: "user", input: {}, prompt },
			{
				cwd: "/proj",
				hasUI: true,
				ui: { notify: (text: string, level: string) => notes.push({ text, level }) },
				getContextUsage: () => ({ percent: 10 }),
				compact: () => {},
				...surf,
			},
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
	return { asked, notes };
}

function harness() {
	const env = tempEnv();
	const runtime = { ...createRuntime(fakePi() as never), config: config() };
	const pi = fakePi();
	registerSpeed(pi as never, runtime);
	return { env, runtime, pi };
}

const lessonsFile = (dir: string) => join(dir, "dredd", "lessons.json");
const savedLessons = (dir: string) => (JSON.parse(readFileSync(lessonsFile(dir), "utf-8")) as { lessons: Array<{ text: string; trigger?: string; source: string }> }).lessons;
const sentText = (callIndex: number) => host.calls[callIndex]?.context.messages?.[0]?.content[0]?.text ?? "";

afterEach(() => {
	host.calls.length = 0;
	host.replies.length = 0;
});

describe("correction learning", () => {
	it("records the normalized rewrite with its trigger, verified through the decision backend", async () => {
		const { env, runtime, pi } = harness();
		try {
			host.replies.push(jsonReply({ text: "never hand-edit generated files; regenerate them", trigger: "editing generated code" }));
			const { notes } = await sendMessage(pi, "when you edit generated code do not hand edit it, ALWAYS regenerate", { correction: 0.9, drifted: 0.05 }, surface());
			expect(runtime.lessons.lessons).toHaveLength(1);
			expect(runtime.lessons.lessons[0]?.text).toBe("never hand-edit generated files; regenerate them");
			expect(runtime.lessons.lessons[0]?.trigger).toBe("editing generated code");
			expect(runtime.lessons.lessons[0]?.source).toBe("operator-correction");
			const saved = savedLessons(env.dir);
			expect(saved[0]?.text).toBe("never hand-edit generated files; regenerate them");
			expect(saved[0]?.trigger).toBe("editing generated code");
			expect(saved[0]?.source).toBe("operator-correction");
			expect(notes.some(n => n.level === "info" && n.text.includes("never hand-edit generated files"))).toBe(true);
			// The rewrite request carried the operator's raw words to @tiny;
			// verification went through the decision backend, not a second model call.
			expect(host.calls).toHaveLength(1);
			expect(host.calls[0]?.model.id).toBe("tiny-1");
			expect(sentText(0)).toContain("ALWAYS regenerate");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("verifies through the host @judge role when the surface has one", async () => {
		const { env, runtime, pi } = harness();
		try {
			host.replies.push(jsonReply({ text: "never force-push to main" }), jsonReply({ faithful: true }));
			const { asked } = await sendMessage(pi, "never force push to main EVER", { correction: 0.9 }, surface({ judge: true }));
			expect(runtime.lessons.lessons[0]?.text).toBe("never force-push to main");
			expect(host.calls).toHaveLength(2);
			expect(host.calls[1]?.model.id).toBe("judge-1");
			// The judge grades the rewrite against the operator's own words.
			expect(sentText(1)).toContain("never force push to main EVER");
			expect(sentText(1)).toContain("never force-push to main");
			// With a judge role the decision backend must not be asked to verify.
			expect(asked.some(ids => ids.includes("drifted"))).toBe(false);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("records nothing and ledgeres when the verifier says the rewrite drifted", async () => {
		const { env, runtime, pi } = harness();
		try {
			host.replies.push(jsonReply({ text: "push carefully" }));
			const { notes } = await sendMessage(pi, "never force push to main", { correction: 0.9, drifted: 0.9 }, surface());
			expect(runtime.lessons.lessons).toHaveLength(0);
			expect(existsSync(lessonsFile(env.dir))).toBe(false);
			expect(notes.some(n => n.level === "warning" && n.text.includes("NOT RECORDED"))).toBe(true);
			const rows = runtime.ledger.recent("", 10).filter(r => r.guard === "correction");
			expect(rows.some(r => r.finding.includes("drifted"))).toBe(true);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("records nothing when the model returns an unusable rewrite", async () => {
		const { env, runtime, pi } = harness();
		try {
			host.replies.push(textReply("Sure, I will not push to main."));
			const { notes } = await sendMessage(pi, "never force push to main", { correction: 0.9 }, surface());
			expect(runtime.lessons.lessons).toHaveLength(0);
			expect(existsSync(lessonsFile(env.dir))).toBe(false);
			expect(notes.some(n => n.text.includes("NOT RECORDED"))).toBe(true);
			expect(runtime.ledger.recent("", 10).some(r => r.guard === "correction" && r.finding.includes("normalize failed"))).toBe(true);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("refuses the correction with NOT RECORDED when no model is available, without calling one", async () => {
		const { env, runtime, pi } = harness();
		try {
			const { notes } = await sendMessage(pi, "never force push to main", { correction: 0.9 }, undefined);
			expect(runtime.lessons.lessons).toHaveLength(0);
			expect(existsSync(lessonsFile(env.dir))).toBe(false);
			expect(notes.some(n => n.level === "warning" && n.text.includes("NOT RECORDED: no model available"))).toBe(true);
			expect(host.calls).toHaveLength(0);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("ignores an ordinary one-time instruction", async () => {
		const { env, runtime, pi } = harness();
		try {
			await sendMessage(pi, "use the graph tools for this one lookup", { correction: 0.1 }, surface());
			expect(runtime.lessons.lessons).toHaveLength(0);
			// A rejected correction never reaches the rewrite model.
			expect(host.calls).toHaveLength(0);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("does not record the same correction twice", async () => {
		const { env, runtime, pi } = harness();
		try {
			host.replies.push(jsonReply({ text: "never push without asking" }), jsonReply({ text: "never push without asking" }));
			const nouls = { correction: 0.9, drifted: 0.05 };
			await sendMessage(pi, "never push without asking me first", nouls, surface());
			await sendMessage(pi, "never push without asking me first", nouls, surface());
			expect(runtime.lessons.lessons).toHaveLength(1);
			expect(savedLessons(env.dir)).toHaveLength(1);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});
});
