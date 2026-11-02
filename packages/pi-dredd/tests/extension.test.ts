import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLessons, registerLedger } from "../extensions/dredd";
import type { LessonsStore } from "../lib/memory";

/**
 * dredd_remember now stores what the host model rewrote and a verifier judged
 * faithful, so these tests supply the host model as an outside service: the
 * compat module is stubbed (production imports it dynamically), replies are
 * queued per call, and every assertion reads the store or the persisted file
 * back — never an internal call.
 */
const host = vi.hoisted(() => ({ replies: [] as unknown[] }));

vi.mock("@earendil-works/pi-ai/compat", () => ({
	completeSimple: async () => {
		const next = host.replies.shift();
		if (next === undefined) throw new Error("test received an unexpected model call");
		return next;
	},
}));

const textReply = (text: string) => ({ stopReason: "stop", content: [{ type: "text", text }] });
const jsonReply = (value: unknown) => textReply(JSON.stringify(value));

/** A host surface offering both roles: rewrite on @tiny, verdict on @judge. */
const surface = {
	models: {
		resolve: (spec: string) => (spec === "@tiny" ? { provider: "test-provider", id: "tiny-1" } : spec === "@judge" ? { provider: "test-provider", id: "judge-1" } : undefined),
	},
	modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true as const, apiKey: "host-key" }) },
};

interface ToolCall {
	name: string;
	args: Record<string, string>;
}
interface CommandCall {
	name: string;
	args: string;
}

/**
 * A minimal ExtensionAPI double: records tool and command registrations so
 * tests can invoke them the way the host would.
 */
function fakePi() {
	const tools: Array<{
		name: string;
		description: string;
		parameters: unknown;
		execute: (toolCallId: string, params: Record<string, string>, signal?: unknown, onUpdate?: unknown, ctx?: unknown) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
	}> = [];
	const commands: Array<{ name: string; description: string; handler: (args: string, ctx: { cwd: string; ui: { notify: (text: string, level: string) => void } }) => Promise<void> }> = [];
	const listeners: Array<{ event: string; handler: (event: unknown, ctx: unknown) => unknown }> = [];
	return {
		tools,
		commands,
		listeners,
		registerTool: (t: (typeof tools)[number]) => tools.push(t),
		registerCommand: (name: string, options: { description: string; handler: (typeof commands)[number]["handler"] }) => commands.push({ name, ...options }),
		on: (event: string, handler: (typeof listeners)[number]["handler"]) => listeners.push({ event, handler }),
	};
}

function notifyCapture() {
	const lines: string[] = [];
	return { lines, ui: { notify: (text: string) => lines.push(text) } };
}
const config = { enabled: true, backend: "typesafe", timeoutMs: 1500, capture: "balanced" as const, questions: [], policies: [] };

function tempEnv() {
	const dir = mkdtempSync(join(tmpdir(), "dredd-ext-"));
	const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = dir;
	return {
		dir,
		restore() {
			if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
		},
	};
}

afterEach(() => {
	host.replies.length = 0;
});

describe("dredd tools and commands", () => {
	it("dredd_remember persists a lesson to the agent dir and confirms it", async () => {
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", { lessons: [] });
			const remember = pi.tools.find(t => t.name === "dredd_remember");
			host.replies.push(jsonReply({ text: "never push to main", trigger: "the target branch is main" }), jsonReply({ faithful: true }));
			const result = await remember?.execute("call-1", { lesson: "when working on main never ever push to it" }, undefined, undefined, surface);
			expect(result?.content[0]?.text).toContain("recorded and confirmed");
			const store = JSON.parse(readFileSync(join(env.dir, "dredd", "lessons.json"), "utf-8")) as { lessons: Array<{ text: string; trigger?: string }> };
			expect(store.lessons[0]?.text).toBe("never push to main");
			expect(store.lessons[0]?.trigger).toBe("the target branch is main");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("dredd_forget removes it, and /dredd lessons reflects both", async () => {
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", { lessons: [] });
			host.replies.push(jsonReply({ text: "always format first" }), jsonReply({ faithful: true }));
			await pi.tools.find(t => t.name === "dredd_remember")?.execute("c1", { lesson: "before anything else always run the formatter" }, undefined, undefined, surface);
			await pi.tools.find(t => t.name === "dredd_forget")?.execute("c2", { lesson: "always format first" });
			const capture = notifyCapture();
			const ctx = { cwd: "/proj", ui: capture.ui };
			pi.commands.find(c => c.name === "dredd")?.handler("lessons", ctx);
			expect(capture.lines[0]).toContain("no lessons recorded");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("/dredd violations reads the ledger scoped to cwd", async () => {
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", { lessons: [] });
			const capture = notifyCapture();
			const ctx = { cwd: "/proj", ui: capture.ui };
			pi.commands.find(c => c.name === "dredd")?.handler("violations", ctx);
			expect(capture.lines[0]).toContain("no recorded violations");
			const storeDir = join(env.dir, "dredd");
			const { openLedger } = await import("../lib/ledger");
			const db = openLedger(join(storeDir, "violations.db"));
			db.insert({
				timestamp: Date.now(), sessionId: null, projectRoot: "/proj", guard: "gate", tool: "bash",
				subject: "rm -rf /", finding: "irreversible:0.93", score: 0.93, steered: false,
			});
			db.close();
			const capture2 = notifyCapture();
			const ctx2 = { cwd: "/proj", ui: capture2.ui };
			pi.commands.find(c => c.name === "dredd")?.handler("violations", ctx2);
			expect(capture2.lines[0]).toContain("irreversible:0.93");
			expect(capture2.lines[0]).toContain("rm -rf /");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("restarting loads persisted lessons", async () => {
		const env = tempEnv();
		try {
			mkdirSync(join(env.dir, "dredd"), { recursive: true });
			writeFileSync(join(env.dir, "dredd", "lessons.json"), JSON.stringify({ lessons: [{ text: "persisted rule", confirmedAt: 1, source: "test" }] }));
			const loaded = loadLessons(join(env.dir, "dredd", "lessons.json"));
			expect(loaded.lessons[0]?.text).toBe("persisted rule");
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", loaded);
			const capture = notifyCapture();
			const ctx = { cwd: "/proj", ui: capture.ui };
			pi.commands.find(c => c.name === "dredd")?.handler("lessons", ctx);
			expect(capture.lines[0]).toContain("persisted rule");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("malformed lessons.json starts empty rather than failing the session", async () => {
		const env = tempEnv();
		try {
			mkdirSync(join(env.dir, "dredd"), { recursive: true });
			writeFileSync(join(env.dir, "dredd", "lessons.json"), "{ broken");
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", { lessons: [] });
			const capture = notifyCapture();
			const ctx = { cwd: "/proj", ui: capture.ui };
			pi.commands.find(c => c.name === "dredd")?.handler("lessons", ctx);
			expect(capture.lines[0]).toContain("no lessons recorded");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("dredd_remember rejects empty lessons", async () => {
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", { lessons: [] });
			const result = await pi.tools.find(t => t.name === "dredd_remember")?.execute("c1", { lesson: "   " }, undefined, undefined, surface);
			expect(result?.content[0]?.text).toContain("empty");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("dredd_remember records nothing and names the missing model when the surface offers none", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			const result = await pi.tools.find(t => t.name === "dredd_remember")?.execute("c1", { lesson: "never push to main" });
			expect(result?.content[0]?.text).toContain("NOT RECORDED");
			expect(result?.content[0]?.text).toContain("no model");
			expect(shared.lessons).toEqual([]);
			expect(existsSync(join(env.dir, "dredd", "lessons.json"))).toBe(false);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});
});

describe("remember/forget shared state", () => {
	it("dredd_remember updates the store it was handed, so guards sharing it see the lesson", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			host.replies.push(jsonReply({ text: "never push to main" }), jsonReply({ faithful: true }));
			await pi.tools.find(t => t.name === "dredd_remember")?.execute("c1", { lesson: "when on main never ever push to it" }, undefined, undefined, surface);
			expect(shared.lessons.map(l => l.text)).toEqual(["never push to main"]);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("tool remember and /dredd forget act on one store", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", shared);
			host.replies.push(jsonReply({ text: "always format first" }), jsonReply({ faithful: true }));
			await pi.tools.find(t => t.name === "dredd_remember")?.execute("c1", { lesson: "before anything else always run the formatter" }, undefined, undefined, surface);
			const capture = notifyCapture();
			await pi.commands.find(c => c.name === "dredd")?.handler("forget always format first", { cwd: "/proj", ui: capture.ui });
			expect(capture.lines[0]).toContain("forgotten");
			expect(shared.lessons).toHaveLength(0);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("two registrations over one store share lessons — no split brain between tools and guards", async () => {
		const env = tempEnv();
		try {
			const shared: LessonsStore = { lessons: [] };
			const toolsPi = fakePi();
			const guardsPi = fakePi();
			registerLedger(toolsPi as never, config, "pi", shared);
			registerLedger(guardsPi as never, config, "pi", shared);
			host.replies.push(jsonReply({ text: "never touch the prod cluster" }), jsonReply({ faithful: true }));
			await toolsPi.tools.find(t => t.name === "dredd_remember")?.execute("c1", { lesson: "never ever connect to the production cluster" }, undefined, undefined, surface);
			const capture = notifyCapture();
			await guardsPi.commands.find(c => c.name === "dredd")?.handler("lessons", { cwd: "/proj", ui: capture.ui });
			expect(capture.lines[0]).toContain("never touch the prod cluster");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("forget rewrites lessons.json so a restart does not resurrect the lesson", async () => {
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", { lessons: [] });
			host.replies.push(jsonReply({ text: "always run the formatter" }), jsonReply({ faithful: true }));
			await pi.tools.find(t => t.name === "dredd_remember")?.execute("c1", { lesson: "always run the formatter before finishing" }, undefined, undefined, surface);
			await pi.commands.find(c => c.name === "dredd")?.handler("forget always run the formatter", { cwd: "/proj", ui: notifyCapture().ui });
			const reloaded = loadLessons(join(env.dir, "dredd", "lessons.json"));
			expect(reloaded.lessons).toEqual([]);
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});

	it("legacy lessons without a trigger and triggered lessons both load without loss", async () => {
		const env = tempEnv();
		try {
			mkdirSync(join(env.dir, "dredd"), { recursive: true });
			writeFileSync(
				join(env.dir, "dredd", "lessons.json"),
				JSON.stringify({
					lessons: [
						{ text: "legacy rule", confirmedAt: 1, source: "operator-correction" },
						{ text: "conditional rule", trigger: "editing generated code", confirmedAt: 2, source: "dredd_remember" },
					],
				}),
			);
			const loaded = loadLessons(join(env.dir, "dredd", "lessons.json"));
			expect(loaded.lessons).toHaveLength(2);
			expect(loaded.lessons[0]?.text).toBe("legacy rule");
			expect(loaded.lessons[0]?.trigger).toBeUndefined();
			expect(loaded.lessons[1]?.text).toBe("conditional rule");
			expect(loaded.lessons[1]?.trigger).toBe("editing generated code");
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", loaded);
			const capture = notifyCapture();
			await pi.commands.find(c => c.name === "dredd")?.handler("lessons", { cwd: "/proj", ui: capture.ui });
			expect(capture.lines[0]).toContain("legacy rule");
			expect(capture.lines[0]).toContain("conditional rule");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});
});