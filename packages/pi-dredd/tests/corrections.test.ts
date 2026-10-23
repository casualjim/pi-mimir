import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntime, registerSpeed } from "../extensions/dredd";
import type { DreddConfig } from "../lib/settings";

const config = (overrides: Partial<DreddConfig> = {}): DreddConfig => ({
	enabled: true,
	backend: { label: "local", host: "http://localhost:1", path: "/v1/systemone", keyEnv: "LOCAL_JUDGE_KEY", defaultModel: "test-model" },
	timeoutMs: 500,
	capture: "balanced",
	questions: [],
	policies: [],
	...overrides,
});

function judgeFetch(nouls: Record<string, number>): typeof fetch {
	return (async (_url: unknown, init?: { body?: unknown }) => {
		const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string }> };
		const answers: Record<string, unknown> = {};
		for (const [id, q] of Object.entries(body.questions)) {
			answers[id] = { type: q.type, noul: nouls[id] ?? 0.02 };
		}
		return new Response(JSON.stringify({ answers, usage: { input_tokens: 1 } }), { status: 200 });
	}) as unknown as typeof fetch;
}

interface FakePiEvent {
	toolName: string;
	input: unknown;
	prompt?: string;
}

interface FakePiCtx {
	cwd: string;
	hasUI: boolean;
	ui: { notify: (text: string, level: string) => void };
}

interface FakePi {
	listeners: Array<{ event: string; handler: (event: FakePiEvent, ctx: FakePiCtx) => unknown }>;
	on: (event: string, handler: (event: FakePiEvent, ctx: FakePiCtx) => unknown) => void;
	registerTool: (tool: unknown) => void;
}

interface FakePiCtx {
	cwd: string;
	hasUI: boolean;
	ui: { notify: (text: string, level: string) => void };
	getContextUsage: () => { percent: number | null };
	compact: () => void;
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

async function sendMessage(pi: FakePi, prompt: string): Promise<void> {
	const handler = pi.listeners.find(l => l.event === "before_agent_start")?.handler;
	if (!handler) throw new Error("no before_agent_start handler registered");
	await handler({ toolName: "user", input: {}, prompt }, { cwd: "/proj", hasUI: false, ui: { notify: () => {} }, getContextUsage: () => ({ percent: 10 }), compact: () => {} });
}

describe("correction learning", () => {
	it("records a standing correction as a lesson that rides future gates", async () => {
		const env = tempEnv();
		try {
			const runtime = { ...createRuntime(fakePi() as never), config: config() };
			const pi = fakePi();
			registerSpeed(pi as never, runtime);
			const originalFetch = globalThis.fetch;
			globalThis.fetch = judgeFetch({ correction: 0.88 });
			try {
				await sendMessage(pi, "YOU MUST ALWAYS INCLUDE ALL TRACKED FILES IN EVERY COMMIT");
			} finally {
				globalThis.fetch = originalFetch;
			}
			expect(runtime.lessons.lessons).toHaveLength(1);
			expect(runtime.lessons.lessons[0]?.text).toBe("YOU MUST ALWAYS INCLUDE ALL TRACKED FILES IN EVERY COMMIT");
			expect(runtime.lessons.lessons[0]?.source).toBe("operator-correction");
			const saved = JSON.parse(readFileSync(join(env.dir, "dredd", "lessons.json"), "utf-8")) as { lessons: Array<{ text: string }> };
			expect(saved.lessons[0]?.text).toContain("TRACKED FILES");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("ignores an ordinary one-time instruction", async () => {
		const env = tempEnv();
		try {
			const runtime = { ...createRuntime(fakePi() as never), config: config() };
			const pi = fakePi();
			registerSpeed(pi as never, runtime);
			const originalFetch = globalThis.fetch;
			globalThis.fetch = judgeFetch({ correction: 0.1 });
			try {
				await sendMessage(pi, "use the graph tools for this one lookup");
			} finally {
				globalThis.fetch = originalFetch;
			}
			expect(runtime.lessons.lessons).toHaveLength(0);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("does not record the same correction twice", async () => {
		const env = tempEnv();
		try {
			const runtime = { ...createRuntime(fakePi() as never), config: config() };
			const pi = fakePi();
			registerSpeed(pi as never, runtime);
			const originalFetch = globalThis.fetch;
			globalThis.fetch = judgeFetch({ correction: 0.9 });
			try {
				await sendMessage(pi, "never push without asking");
				await sendMessage(pi, "never push without asking");
			} finally {
				globalThis.fetch = originalFetch;
			}
			expect(runtime.lessons.lessons).toHaveLength(1);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});
});
