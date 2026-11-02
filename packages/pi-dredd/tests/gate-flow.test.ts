import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntime, registerGate, registerSpeed } from "../extensions/dredd";
import type { DreddConfig } from "../lib/settings";

interface ToolCallHandler {
	(event: { toolName: string; input: unknown; prompt?: string }, ctx: { cwd: string; hasUI: boolean; ui: { notify: (text: string, level: string) => void; confirm?: (title: string, message: string) => Promise<boolean> } }): Promise<{ block: boolean; reason: string } | undefined>;
}

function fakePi() {
	const listeners: Array<{ event: string; handler: ToolCallHandler }> = [];
	return {
		listeners,
		on: (event: string, handler: ToolCallHandler) => listeners.push({ event, handler }),
		registerTool: (_tool: unknown) => {},
	};
}

const config = (overrides: Partial<DreddConfig> = {}): DreddConfig => ({
	enabled: true,
	backend: { label: "local", host: "http://localhost:1", keyEnv: "LOCAL_JUDGE_KEY", defaultModel: "test-model" },
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
			answers[id] = { type: "noul", noul: nouls[id] ?? 0.02 };
		}
		return new Response(JSON.stringify({ answers, usage: { input_tokens: 10 } }), { status: 200 });
	}) as unknown as typeof fetch;
}

function tempEnv() {
	const dir = mkdtempSync(join(tmpdir(), "dredd-gate-"));
	const old = process.env.PI_CODING_AGENT_DIR;
	const oldKey = process.env.LOCAL_JUDGE_KEY;
	process.env.PI_CODING_AGENT_DIR = dir;
	process.env.LOCAL_JUDGE_KEY = "test-judge-key";
	return {
		dir,
		restore() {
			if (old === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = old;
			if (oldKey === undefined) delete process.env.LOCAL_JUDGE_KEY;
			else process.env.LOCAL_JUDGE_KEY = oldKey;
		},
	};
}

async function callGate(pi: ReturnType<typeof fakePi>, command: string, ctx: { hasUI?: boolean; confirm?: (title: string, message: string) => Promise<boolean> } = {}) {
	const handler = pi.listeners.find(l => l.event === "tool_call")?.handler;
	if (!handler) throw new Error("no tool_call handler registered");
	return handler(
		{ toolName: "bash", input: { command } },
		{ cwd: "/proj", hasUI: ctx.hasUI ?? false, ui: { notify: () => {}, confirm: ctx.confirm } },
	);
}

describe("bash gate end to end", () => {
	it("blocks a force push at the offline floor with no key configured", async () => {
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerGate(pi as never, { ...createRuntime(pi as never), config: config({ backend: "typesafe" }) });
			const result = await callGate(pi, "git push --force origin main");
			expect(result?.block).toBe(true);
			expect(result?.reason).toContain("force push");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("holds when the judge scores irreversibility high", async () => {
		const env = tempEnv();
		try {
			const runtime = { ...createRuntime(fakePi() as never), config: config() };
			const pi = fakePi();
			registerGate(pi as never, { ...runtime, ledger: runtime.ledger });
			// Inject the judge fetch through the runtime config's apiKey path: patch global fetch for the test.
			const originalFetch = globalThis.fetch;
			globalThis.fetch = judgeFetch({ irreversible: 0.95 });
			try {
				const result = await callGate(pi, "psql -c 'TRUNCATE TABLE events'");
				expect(result?.block).toBe(true);
				expect(result?.reason).toContain("pi-dredd blocked this");
			} finally {
				globalThis.fetch = originalFetch;
			}
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("warns but passes on a mid-band score", async () => {
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerGate(pi as never, { ...createRuntime(pi as never), config: config() });
			const originalFetch = globalThis.fetch;
			globalThis.fetch = judgeFetch({ destructive: 0.6 });
			try {
				const result = await callGate(pi, "cargo clean");
				expect(result).toBeUndefined();
			} finally {
				globalThis.fetch = originalFetch;
			}
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("judges a read-only command and lets it pass on low scores", async () => {
		// The old read-only bypass is gone: a judged call is a request the judge
		// observes. Asserting the request happened is behavior — a reverted
		// bypass would answer zero requests and fail here.
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerGate(pi as never, { ...createRuntime(pi as never), config: config({ capture: "balanced" }) });
			const bodies: string[] = [];
			const originalFetch = globalThis.fetch;
			globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
				bodies.push(String(init?.body));
				return new Response(JSON.stringify({ answers: { irreversible: { type: "noul", noul: 0.02 }, destructive: { type: "noul", noul: 0.02 }, sendsOut: { type: "noul", noul: 0.02 } }, usage: { input_tokens: 1 } }), { status: 200 });
			}) as unknown as typeof fetch;
			try {
				const result = await callGate(pi, "git status");
				expect(result).toBeUndefined();
				expect(bodies).toHaveLength(1);
			} finally {
				globalThis.fetch = originalFetch;
			}
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("enforces a recorded lesson on a read-only command the bypass once skipped", async () => {
		// The operator's lesson must ride every judged call, read-only included:
		// the wire must carry the policy question and a high score must hold.
		const env = tempEnv();
		try {
			const runtime = createRuntime(fakePi() as never);
			runtime.lessons.lessons.push({ text: "never read the prod credentials file", trigger: "the path is under ~/.aws", confirmedAt: Date.now(), source: "dredd_remember" });
			const pi = fakePi();
			registerGate(pi as never, { ...runtime, config: config({ capture: "balanced" }) });
			let wireQuestions: Record<string, { type: string; instructions: string }> = {};
			const originalFetch = globalThis.fetch;
			globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
				const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string; instructions: string }> };
				wireQuestions = body.questions;
				const answers: Record<string, unknown> = {};
				for (const [id, q] of Object.entries(body.questions)) {
					answers[id] = { type: "noul", noul: id === "policy0" ? 0.96 : 0.02 };
				}
				return new Response(JSON.stringify({ answers, usage: { input_tokens: 1 } }), { status: 200 });
			}) as unknown as typeof fetch;
			try {
				const result = await callGate(pi, "cat ~/.aws/credentials");
				expect(result?.block).toBe(true);
				expect(result?.reason).toContain("never read the prod credentials file");
			} finally {
				globalThis.fetch = originalFetch;
			}
			// The judge saw the rule and its condition; that is how it could hold.
			expect(wireQuestions.policy0?.type).toBe("noul");
			expect(wireQuestions.policy0?.instructions).toContain("never read the prod credentials file");
			expect(wireQuestions.policy0?.instructions).toContain("the path is under ~/.aws");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("fails open on judge error and records it", async () => {
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerGate(pi as never, { ...createRuntime(pi as never), config: config() });
			const failingFetch: typeof fetch = (async () => {
				throw new Error("connection refused");
			}) as unknown as typeof fetch;
			const originalFetch = globalThis.fetch;
			globalThis.fetch = failingFetch;
			try {
				const result = await callGate(pi, "cargo build --release");
				expect(result).toBeUndefined();
			} finally {
				globalThis.fetch = originalFetch;
			}
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("a recorded lesson rides the gate as a policy question and holds", async () => {
		const env = tempEnv();
		try {
			const runtime = createRuntime(fakePi() as never);
			runtime.lessons.lessons.push({ text: "never touch the prod cluster", confirmedAt: Date.now(), source: "dredd_remember" });
			const pi = fakePi();
			registerGate(pi as never, { ...runtime, config: config() });
			const originalFetch = globalThis.fetch;
			// The server answers the policy question high; the base questions low.
			globalThis.fetch = judgeFetch({ policy0: 0.97 });
			try {
				const result = await callGate(pi, "kubectl --context prod apply -f deploy.yaml");
				expect(result?.block).toBe(true);
				expect(result?.reason).toContain("never touch the prod cluster");
			} finally {
				globalThis.fetch = originalFetch;
			}
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});
});

describe("hold approval loop", () => {
	it("holds, reads the operator's approval from their reply, and lets the identical retry pass exactly once", async () => {
		const env = tempEnv();
		try {
			const runtime = { ...createRuntime(fakePi() as never), config: config() };
			const pi = fakePi();
			registerGate(pi as never, runtime);
			registerSpeed(pi as never, runtime);
			const command = "git push --force origin main";
			const held = await callGate(pi, command);
			expect(held?.block).toBe(true);
			expect(runtime.pendingHold?.command).toBe(command);
			expect(runtime.approved).toBeNull();

			const originalFetch = globalThis.fetch;
			globalThis.fetch = judgeFetch({ approves: 0.95 });
			try {
				const startHandler = pi.listeners.find(l => l.event === "before_agent_start")?.handler;
				if (!startHandler) throw new Error("no before_agent_start handler registered");
				await startHandler({ toolName: "user", input: {}, prompt: "ok I approve the operation" }, { cwd: "/proj", hasUI: false, ui: { notify: () => {} } });
			} finally {
				globalThis.fetch = originalFetch;
			}
			expect(runtime.approved?.command).toBe(command);
			expect(runtime.pendingHold).toBeNull();

			// Identical retry passes once and consumes the approval.
			expect(await callGate(pi, command)).toBeUndefined();
			expect(runtime.approved).toBeNull();
			// A second attempt is held again.
			const reheld = await callGate(pi, command);
			expect(reheld?.block).toBe(true);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("keeps the hold when the reply does not approve the command", async () => {
		const env = tempEnv();
		try {
			const runtime = { ...createRuntime(fakePi() as never), config: config() };
			const pi = fakePi();
			registerGate(pi as never, runtime);
			registerSpeed(pi as never, runtime);
			const command = "git push --force origin main";
			await callGate(pi, command);
			expect(runtime.pendingHold?.command).toBe(command);

			const originalFetch = globalThis.fetch;
			globalThis.fetch = judgeFetch({ approves: 0.1 });
			try {
				const startHandler = pi.listeners.find(l => l.event === "before_agent_start")?.handler;
				if (!startHandler) throw new Error("no before_agent_start handler registered");
				await startHandler({ toolName: "user", input: {}, prompt: "no, do something else instead" }, { cwd: "/proj", hasUI: false, ui: { notify: () => {} } });
			} finally {
				globalThis.fetch = originalFetch;
			}
			expect(runtime.approved).toBeNull();
			const stillHeld = await callGate(pi, command);
			expect(stillHeld?.block).toBe(true);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("releases a floor hold at the UI confirm without touching the judge", async () => {
		const env = tempEnv();
		try {
			const runtime = { ...createRuntime(fakePi() as never), config: config() };
			const pi = fakePi();
			registerGate(pi as never, runtime);
			const originalFetch = globalThis.fetch;
			globalThis.fetch = (async () => { throw new Error("judge must not be called"); }) as unknown as typeof fetch;
			try {
				const result = await callGate(pi, "git push --force origin main", { hasUI: true, confirm: async () => true });
				expect(result).toBeUndefined();
			} finally {
				globalThis.fetch = originalFetch;
			}
			expect(runtime.pendingHold).toBeNull();
			expect(runtime.approved).toBeNull();
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("blocks without pendingHold when the operator declines the confirm", async () => {
		const env = tempEnv();
		try {
			const runtime = { ...createRuntime(fakePi() as never), config: config() };
			const pi = fakePi();
			registerGate(pi as never, runtime);
			const declined = await callGate(pi, "git push --force origin main", { hasUI: true, confirm: async () => false });
			expect(declined?.block).toBe(true);
			expect(declined?.reason).toContain("declined");
			expect(runtime.pendingHold).toBeNull();
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("falls back to the block-and-hold path when confirm throws", async () => {
		const env = tempEnv();
		try {
			const runtime = { ...createRuntime(fakePi() as never), config: config() };
			const pi = fakePi();
			registerGate(pi as never, runtime);
			const command = "git push --force origin main";
			const held = await callGate(pi, command, {
				hasUI: true,
				confirm: async () => { throw new Error("ui gone"); },
			});
			expect(held?.block).toBe(true);
			expect(runtime.pendingHold?.command).toBe(command);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});

	it("releases the held command via the reply token with the judge unreachable", async () => {
		const env = tempEnv();
		try {
			const runtime = { ...createRuntime(fakePi() as never), config: config() };
			const pi = fakePi();
			registerGate(pi as never, runtime);
			registerSpeed(pi as never, runtime);
			const command = "git push --force origin main";
			const held = await callGate(pi, command);
			expect(held?.block).toBe(true);
			expect(runtime.pendingHold?.command).toBe(command);

			const originalFetch = globalThis.fetch;
			globalThis.fetch = (async () => { throw new Error("judge unreachable"); }) as unknown as typeof fetch;
			try {
				const startHandler = pi.listeners.find(l => l.event === "before_agent_start")?.handler;
				if (!startHandler) throw new Error("no before_agent_start handler registered");
				await startHandler({ toolName: "user", input: {}, prompt: "dredd: approve" }, { cwd: "/proj", hasUI: false, ui: { notify: () => {} } });
			} finally {
				globalThis.fetch = originalFetch;
			}
			expect(runtime.approved?.command).toBe(command);
			expect(runtime.pendingHold).toBeNull();

			// Identical retry passes once and consumes the approval.
			expect(await callGate(pi, command)).toBeUndefined();
			expect(runtime.approved).toBeNull();
			// A second attempt is held again.
			const reheld = await callGate(pi, command);
			expect(reheld?.block).toBe(true);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true, force: true });
		}
	});
});