import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LESSON_CHARS } from "../lib/memory";
import type { LessonsStore } from "../lib/memory";
import { loadLessons, registerLedger } from "../extensions/dredd";

/**
 * The host model is an outside service; dredd_remember's contract is what it
 * asks that service to do and, above all, what ends up in the operator's
 * lesson store. The compat module is stubbed (the production path imports it
 * dynamically), replies are queued per call, and every assertion reads the
 * store or the persisted file back — never an internal call.
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
const FAITHFUL = { faithful: true };

function surface(ctx: { judge: boolean }) {
	return {
		models: { resolve: (spec: string) => (spec === "@tiny" ? tiny : ctx.judge ? judge : undefined) },
		modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true as const, apiKey: "host-key" }) },
	};
}

interface RegisteredTool {
	execute: (toolCallId: string, params: Record<string, string>, signal?: unknown, onUpdate?: unknown, ctx?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
}
interface RegisteredCommand {
	handler: (args: string, ctx: { cwd: string; ui: { notify: (text: string, level: string) => void } }) => Promise<void>;
}

interface FakePi {
	tools: Array<{ name: string } & RegisteredTool>;
	commands: RegisteredCommand[];
	registerTool: (t: { name: string; execute: RegisteredTool["execute"] }) => void;
	registerCommand: (name: string, options: { handler: RegisteredCommand["handler"] }) => void;
	on: (event: string, handler: unknown) => void;
}

function fakePi(): FakePi {
	const tools: FakePi["tools"] = [];
	const commands: RegisteredCommand[] = [];
	return {
		tools,
		commands,
		registerTool: t => tools.push({ name: t.name, execute: t.execute }),
		registerCommand: (_name, options) => commands.push({ handler: options.handler }),
		on: () => {},
	};
}

const config = { enabled: true, backend: { label: "local", host: "http://localhost:1", keyEnv: "LOCAL_JUDGE_KEY", defaultModel: "test-model" }, timeoutMs: 500, capture: "balanced" as const, questions: [], policies: [] };

function tempEnv() {
	const dir = mkdtempSync(join(tmpdir(), "dredd-norm-"));
	const oldDir = process.env.PI_CODING_AGENT_DIR;
	const oldKey = process.env.LOCAL_JUDGE_KEY;
	process.env.PI_CODING_AGENT_DIR = dir;
	process.env.LOCAL_JUDGE_KEY = "test-judge-key";
	return {
		dir,
		restore() {
			if (oldDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = oldDir;
			if (oldKey === undefined) delete process.env.LOCAL_JUDGE_KEY;
			else process.env.LOCAL_JUDGE_KEY = oldKey;
		},
	};
}

/** Decision-backend double: answers every noul question with `noul`, unless
 * the id names the drift question and `drift` overrides it. */
function judgeReply(noul: number, drift?: number): typeof fetch {
	return (async (_url: unknown, init?: { body?: unknown }) => {
		const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string }> };
		const answers: Record<string, unknown> = {};
		for (const [id, q] of Object.entries(body.questions)) {
			if (q.type !== "noul") throw new Error(`unexpected question type on the fallback verifier: ${id}`);
			answers[id] = { type: "noul", noul: id.includes("drift") ? (drift ?? noul) : noul };
		}
		return new Response(JSON.stringify({ answers, usage: { input_tokens: 1 } }), { status: 200 });
	}) as unknown as typeof fetch;
}

const remember = (pi: FakePi) => pi.tools.find(t => t.name === "dredd_remember");
const lessonsFile = (dir: string) => join(dir, "dredd", "lessons.json");

afterEach(() => {
	host.calls.length = 0;
	host.replies.length = 0;
});

describe("dredd_remember normalization outcomes", () => {
	it("stores the normalized rule with its trigger and persists the trigger", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			host.replies.push(jsonReply({ text: "never hand-edit generated files", trigger: "editing generated code" }), jsonReply(FAITHFUL));
			const result = await remember(pi)?.execute("c1", { lesson: "when you edit generated code do not hand edit it, regenerate" }, undefined, undefined, surface({ judge: true }));
			expect(result?.content[0]?.text).toContain("recorded and confirmed");
			expect(shared.lessons).toHaveLength(1);
			expect(shared.lessons[0]?.text).toBe("never hand-edit generated files");
			expect(shared.lessons[0]?.trigger).toBe("editing generated code");
			expect(loadLessons(lessonsFile(env.dir)).lessons[0]?.trigger).toBe("editing generated code");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("records nothing and names the missing model when the surface carries no model, without calling one", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			const result = await remember(pi)?.execute("c1", { lesson: "never push to main" });
			expect(result?.content[0]?.text).toContain("NOT RECORDED");
			expect(result?.content[0]?.text).toContain("no model");
			expect(shared.lessons).toEqual([]);
			expect(existsSync(lessonsFile(env.dir))).toBe(false);
			expect(host.calls).toHaveLength(0);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("records nothing and says NOT RECORDED when the model call errors", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			host.replies.push({ stopReason: "error", errorMessage: "rate limited" });
			const result = await remember(pi)?.execute("c1", { lesson: "never push to main" }, undefined, undefined, surface({ judge: true }));
			expect(result?.content[0]?.text).toContain("NOT RECORDED");
			expect(shared.lessons).toHaveLength(0);
			expect(existsSync(lessonsFile(env.dir))).toBe(false);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("records nothing when the model returns an unusable rewrite", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			host.replies.push(textReply("Sure, I will not push to main."));
			const result = await remember(pi)?.execute("c1", { lesson: "never push to main" }, undefined, undefined, surface({ judge: true }));
			expect(result?.content[0]?.text).toContain("NOT RECORDED");
			expect(shared.lessons).toHaveLength(0);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("records nothing when the semantic verifier says the rewrite drifted", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			host.replies.push(jsonReply({ text: "push carefully" }), jsonReply({ faithful: false }));
			const result = await remember(pi)?.execute("c1", { lesson: "never push to main" }, undefined, undefined, surface({ judge: true }));
			expect(result?.content[0]?.text).toContain("NOT RECORDED");
			expect(shared.lessons).toHaveLength(0);
			expect(existsSync(lessonsFile(env.dir))).toBe(false);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("verifies through the configured decision backend when the host has no @judge role", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			host.replies.push(jsonReply({ text: "never push to main", trigger: "the target branch is main" }));
			const originalFetch = globalThis.fetch;
			globalThis.fetch = judgeReply(0.1, 0.2);
			try {
				const result = await remember(pi)?.execute("c1", { lesson: "never ever force push to main" }, undefined, undefined, surface({ judge: false }));
				expect(result?.content[0]?.text).toContain("recorded and confirmed");
			} finally {
				globalThis.fetch = originalFetch;
			}
			expect(shared.lessons[0]?.trigger).toBe("the target branch is main");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("records nothing when no verifier is reachable", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			host.replies.push(jsonReply({ text: "never push to main" }));
			const originalFetch = globalThis.fetch;
			globalThis.fetch = (async () => {
				throw new Error("judge unreachable");
			}) as unknown as typeof fetch;
			try {
				const result = await remember(pi)?.execute("c1", { lesson: "never push to main" }, undefined, undefined, surface({ judge: false }));
				expect(result?.content[0]?.text).toContain("NOT RECORDED");
			} finally {
				globalThis.fetch = originalFetch;
			}
			expect(shared.lessons).toHaveLength(0);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("never sends empty or over-long input to the model", async () => {
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", { lessons: [] });
			const empty = await remember(pi)?.execute("c1", { lesson: "   " }, undefined, undefined, surface({ judge: true }));
			const over = await remember(pi)?.execute("c2", { lesson: "x".repeat(LESSON_CHARS + 1) }, undefined, undefined, surface({ judge: true }));
			expect(empty?.content[0]?.text).toContain("empty");
			expect(over?.content[0]?.text).toContain(`${LESSON_CHARS} characters`);
			expect(host.calls).toHaveLength(0);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});
});

describe("triggered lessons through the shared store", () => {
	it("a triggered lesson written via one registration reads back from another and survives reload", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const writer = fakePi();
			const reader = fakePi();
			registerLedger(writer as never, config, "pi", shared);
			registerLedger(reader as never, config, "pi", shared);
			host.replies.push(jsonReply({ text: "never hand-edit generated files", trigger: "editing generated code" }), jsonReply(FAITHFUL));
			await remember(writer)?.execute("c1", { lesson: "stop hand editing generated files, regenerate them" }, undefined, undefined, surface({ judge: true }));
			const capture: string[] = [];
			await reader.commands[0]?.handler("lessons", { cwd: "/proj", ui: { notify: t => capture.push(t) } });
			expect(capture[0]).toContain("never hand-edit generated files");
			const reloaded = loadLessons(lessonsFile(env.dir));
			expect(reloaded.lessons[0]?.text).toBe("never hand-edit generated files");
			expect(reloaded.lessons[0]?.trigger).toBe("editing generated code");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("forgetting a triggered lesson removes it from the store and the file", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			host.replies.push(jsonReply({ text: "never hand-edit generated files", trigger: "editing generated code" }), jsonReply(FAITHFUL));
			await remember(pi)?.execute("c1", { lesson: "stop hand editing generated files" }, undefined, undefined, surface({ judge: true }));
			await pi.tools.find(t => t.name === "dredd_forget")?.execute("c2", { lesson: "never hand-edit generated files" });
			expect(shared.lessons).toHaveLength(0);
			expect(loadLessons(lessonsFile(env.dir)).lessons).toHaveLength(0);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});
});
