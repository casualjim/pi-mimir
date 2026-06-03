import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

let mockAgentDir = "";
const spawned: FakeChild[] = [];

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return {
		...actual,
		getAgentDir: () => mockAgentDir,
	};
});

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return {
		...actual,
		spawn: vi.fn((command: string, args: readonly string[]) => {
			const child = new FakeChild();
			child.command = command;
			child.args = [...args];
			spawned.push(child);
			return child as unknown as ChildProcessWithoutNullStreams;
		}),
	};
});

describe("foreground bash regression with background extension enabled", () => {
	let rootDir: string;
	let cwd: string;

	beforeEach(() => {
		rootDir = join(tmpdir(), `heimdall-bg-regression-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		cwd = join(rootDir, "repo");
		mockAgentDir = join(rootDir, "agent");
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		mkdirSync(mockAgentDir, { recursive: true });
		writeFileSync(join(cwd, ".pi", "heimdall.jsonc"), JSON.stringify({
			sandbox: { enabled: true, useDefaultFilesystemDeny: false, filesystem: { writable: ["."] } },
			commandPolicies: [{ name: "no-cargo-test", blocked: ["cargo", "test"], message: "Use mise test." }],
		}));
		spawned.length = 0;
	});

	afterEach(() => {
		vi.resetModules();
		rmSync(rootDir, { recursive: true, force: true });
	});

	it("does not background timed-out bash commands and preserves guard + sandbox execution behavior", async () => {
		const harness = createHarness(cwd);
		const { default: heimdall } = await import("../extensions/heimdall");
		const { default: heimdallBackgroundTasks } = await import("../extensions/heimdall-bg-tasks");
		heimdall(harness.pi);
		heimdallBackgroundTasks(harness.pi);
		await harness.emitSessionStart();

		const blocked = await harness.emitToolCall("bash", { command: "cargo test" });
		expect(blocked).toEqual({
			block: true,
			reason: expect.stringContaining('Blocked: command violates repo policy "no-cargo-test".'),
		});

		let timeoutError: Error | null = null;
		try {
			await harness.executeTool("bash", { command: "sleep 5", timeout: 1 });
		} catch (error) {
			timeoutError = error as Error;
		}
		expect(timeoutError?.message).toContain("Command timed out after 1 seconds");

		expect(spawned).toHaveLength(1);
		expect(spawned[0]?.command.endsWith("heimdall-sandbox")).toBe(true);
		expect(spawned[0]?.args).toEqual(["exec", "--policy", "-"]);
		expect(spawned[0]?.stdin.end).toHaveBeenCalledWith(expect.stringContaining('"command":["bash","-c","sleep 5"]'));

		const tasksList = await harness.executeTool("bg_task", { action: "list" });
		const tasksListText = tasksList.content[0]?.type === "text" ? tasksList.content[0].text : "";
		expect(tasksListText).toBe("No background tasks.");
		expect(harness.sendMessage).not.toHaveBeenCalled();
	});
});

class FakeChild extends EventEmitter {
	pid = 4242;
	command = "";
	args: string[] = [];
	stdout = new EventEmitter();
	stderr = new EventEmitter();
	stdin = { end: vi.fn() };
	kill = vi.fn((_signal?: string) => {
		queueMicrotask(() => this.emit("close", null));
		return true;
	});
}

function createHarness(cwd: string) {
	const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
	const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
	const sendMessage = vi.fn();
	const notify = vi.fn();
	const theme = {
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		fg: (_color: string, text: string) => text,
	};
	const pi = {
		exec: vi.fn(),
		getActiveTools: vi.fn(() => []),
		getAllTools: vi.fn(() => []),
		getCommands: vi.fn(() => []),
		getFlag: vi.fn(() => false),
		getSessionName: vi.fn(() => undefined),
		getThinkingLevel: vi.fn(() => "off"),
		on: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		}),
		registerCommand: vi.fn(),
		registerFlag: vi.fn(),
		registerMessageRenderer: vi.fn(),
		registerProvider: vi.fn(),
		registerShortcut: vi.fn(),
		registerTool: vi.fn((tool: { name: string; execute: (...args: any[]) => Promise<any> }) => {
			tools.set(tool.name, tool);
		}),
		appendEntry: vi.fn(),
		sendMessage,
		sendUserMessage: vi.fn(),
		setActiveTools: vi.fn(),
		setLabel: vi.fn(),
		setModel: vi.fn(),
		setSessionName: vi.fn(),
		setThinkingLevel: vi.fn(),
		unregisterProvider: vi.fn(),
		events: { emit: vi.fn(), on: vi.fn() },
	} as unknown as ExtensionAPI;

	const ctx = {
		cwd,
		hasUI: true,
		ui: {
			notify,
			setStatus: vi.fn(),
			setWidget: vi.fn(),
			theme,
		},
	};

	const originalRegisterTool = pi.registerTool as unknown as ReturnType<typeof vi.fn>;
	originalRegisterTool.mockImplementation((tool: { name: string; execute: (...args: any[]) => Promise<any> }) => {
		tools.set(tool.name, tool);
	});

	return {
		pi,
		sendMessage,
		async emitSessionStart() {
			for (const handler of handlers.get("session_start") ?? []) {
				await handler({}, ctx);
			}
		},
		async executeTool(name: string, params: Record<string, unknown>) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not registered: ${name}`);
			return tool.execute("tool-call", params, undefined, undefined, ctx);
		},
		async emitToolCall(toolName: string, input: Record<string, unknown>) {
			for (const handler of handlers.get("tool_call") ?? []) {
				const result = await handler({ toolName, input, type: toolName }, ctx);
				if (result) return result;
			}
			return undefined;
		},
	};
}
