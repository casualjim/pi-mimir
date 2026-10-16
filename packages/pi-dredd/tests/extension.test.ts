import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLessons, registerLedger } from "../extensions/dredd";

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
		execute: (toolCallId: string, params: Record<string, string>) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
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

describe("dredd tools and commands", () => {
	it("dredd_remember persists a lesson to the agent dir and confirms it", async () => {
		const env = tempEnv();
		try {
			const pi = fakePi();
			registerLedger(pi as never, config, "pi", { lessons: [] });
			const remember = pi.tools.find(t => t.name === "dredd_remember");
			const result = await remember?.execute("call-1", { lesson: "never push to main" });
			expect(result?.content[0]?.text).toContain("recorded and confirmed");
			const store = JSON.parse(readFileSync(join(env.dir, "dredd", "lessons.json"), "utf-8")) as { lessons: Array<{ text: string }> };
			expect(store.lessons[0]?.text).toBe("never push to main");
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
			await pi.tools.find(t => t.name === "dredd_remember")?.execute("c1", { lesson: "always format first" });
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
			const result = await pi.tools.find(t => t.name === "dredd_remember")?.execute("c1", { lesson: "   " });
			expect(result?.content[0]?.text).toContain("empty");
		} finally {
			env.restore();
			rmSync(env.dir, { recursive: true });
		}
	});
});