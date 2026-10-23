import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

interface SentMessage {
	customType?: string;
	content: string;
}

interface FakePi {
	listeners: Array<{ event: string; handler: (event: unknown, ctx: unknown) => unknown }>;
	sent: SentMessage[];
	on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => void;
	registerTool: (tool: unknown) => void;
	sendMessage: (message: SentMessage) => void;
}

function fakePi(): FakePi {
	const listeners: FakePi["listeners"] = [];
	const sent: SentMessage[] = [];
	return {
		listeners,
		sent,
		on: (event, handler) => listeners.push({ event, handler }),
		registerTool: () => { },
		sendMessage: message => sent.push(message),
	};
}

describe("forced skill injection", () => {
	it("injects the picked skill's body, not a pointer", async () => {
		const dir = mkdtempSync(join(tmpdir(), "dredd-forcing-"));
		const skillFile = join(dir, "SKILL.md");
		const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
		const oldKey = process.env.LOCAL_JUDGE_KEY;
		const originalFetch = globalThis.fetch;
		process.env.PI_CODING_AGENT_DIR = dir;
		process.env.LOCAL_JUDGE_KEY = "test-judge-key";
		writeFileSync(skillFile, "---\nname: codebase-memory\ndescription: Graph queries.\n---\n\n# Graph first\n\nCall search_graph before grep.\n");
		globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
			const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string; instructions?: string }> };
			const answers: Record<string, unknown> = {};
			for (const [id, q] of Object.entries(body.questions)) {
				const name = /Skill "([^"]+)"/.exec(q.instructions ?? "")?.[1];
				answers[id] = { type: "noul", noul: name === "codebase-memory" ? 0.93 : id === "correction" ? 0.05 : 0.01 };
			}
			return new Response(JSON.stringify({ answers, usage: { input_tokens: 1 } }), { status: 200 });
		}) as unknown as typeof fetch;
		try {
			const pi = fakePi();
			const runtime = { ...createRuntime(pi as never), config: config() };
			registerSpeed(pi as never, runtime);
			const handler = pi.listeners.find(l => l.event === "before_agent_start")?.handler;
			if (!handler) throw new Error("no before_agent_start handler registered");
			await handler(
				{ toolName: "user", input: {}, prompt: "trace the callers in the graph", systemPromptOptions: { skills: [{ name: "codebase-memory", description: "Graph queries.", filePath: skillFile }] } },
				{ cwd: "/proj", hasUI: false, ui: { notify: () => { } }, getContextUsage: () => ({ percent: 10 }), compact: () => { } },
			);
			const injected = pi.sent.filter(message => message.customType === "pi-dredd-skill");
			expect(injected).toHaveLength(1);
			expect(injected[0]?.content).toContain('"codebase-memory"');
			expect(injected[0]?.content).toContain("0.93");
			expect(injected[0]?.content).toContain("Call search_graph before grep.");
			expect(injected[0]?.content).not.toContain("description: Graph queries.");
		} finally {
			globalThis.fetch = originalFetch;
			if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
			if (oldKey === undefined) delete process.env.LOCAL_JUDGE_KEY;
			else process.env.LOCAL_JUDGE_KEY = oldKey;
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
