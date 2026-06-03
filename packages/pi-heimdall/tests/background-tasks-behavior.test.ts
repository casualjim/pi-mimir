import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { BG_OUTPUT_SETTLE_MS } from "../lib/background-tasks/shared";
import { buildSandboxPolicy } from "../lib/sandbox/config";

let mockAgentDir = "";
let mockBinaryFound = true;
let mockLaunchError: Error | null = null;
const launchCalls: Array<{ command: string; cwd: string }> = [];
const createdChildren: FakeChild[] = [];

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return {
		...actual,
		getAgentDir: () => mockAgentDir,
	};
});

vi.mock("../lib/sandbox/runtime.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../lib/sandbox/runtime")>();
	return {
		...actual,
		launchSandboxProcess: vi.fn(async (config, command, options) => {
			if (mockLaunchError) {
				throw mockLaunchError;
			}
			if (!existsSync(options.cwd)) {
				throw new Error(`Working directory does not exist: ${options.cwd}`);
			}
			const child = createFakeChild();
			createdChildren.push(child);
			launchCalls.push({ command, cwd: options.cwd });
			const policy = buildSandboxPolicy(config, options.cwd, command);
			return {
				binaryPath: "/bin/heimdall-sandbox",
				child,
				cwd: options.cwd,
				policy,
				policyJson: `${JSON.stringify(policy)}\n`,
			};
		}),
		resolveHeimdallSandboxBinary: vi.fn(() => ({
			binaryPath: "/bin/heimdall-sandbox",
			found: mockBinaryFound,
			source: "path" as const,
		})),
	};
});

describe("background task behaviors", () => {
	let rootDir: string;
	let cwd: string;

	beforeEach(() => {
		vi.useFakeTimers();
		rootDir = join(tmpdir(), `heimdall-bg-behavior-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		cwd = join(rootDir, "repo");
		mockAgentDir = join(rootDir, "agent");
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		mkdirSync(mockAgentDir, { recursive: true });
		writeFileSync(join(cwd, ".pi", "heimdall.jsonc"), `{ "sandbox": { "enabled": true } }`);
		mockBinaryFound = true;
		mockLaunchError = null;
		launchCalls.length = 0;
		createdChildren.length = 0;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.resetModules();
		rmSync(rootDir, { recursive: true, force: true });
	});

	it("spawns, lists, logs, stops, clears, and emits output/exit follow-ups", async () => {
		const harness = createHarness(cwd);
		const { default: registerBackgroundTasksExtension } = await import("../lib/background-tasks/extension");
		registerBackgroundTasksExtension(harness.pi);
		await harness.emitSessionStart();

		const spawnResult = await harness.executeTool("bg_task", {
			action: "spawn",
			command: "echo READY",
			notifyPattern: "READY",
		});
		const spawnText = spawnResult.content[0]?.type === "text" ? spawnResult.content[0].text : "";
		expect(spawnText).toContain("Started bg-1");
		expect(launchCalls).toEqual([{ command: "echo READY", cwd }]);

		const child = createdChildren[0]!;
		expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining('"command":["bash","-c","echo READY"]'));
		expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining('"stdio":"piped"'));
		child.stdout.emit("data", Buffer.from("waiting\n"));
		await vi.advanceTimersByTimeAsync(BG_OUTPUT_SETTLE_MS);
		expect(harness.sendMessage).not.toHaveBeenCalled();

		child.stdout.emit("data", Buffer.from("READY\n"));
		await vi.advanceTimersByTimeAsync(BG_OUTPUT_SETTLE_MS);
		expect(harness.sendMessage).toHaveBeenCalledTimes(1);
		expect(harness.sendMessage.mock.calls[0]?.[0].content[0].text).toContain("READY");

		const listResult = await harness.executeTool("bg_task", { action: "list" });
		const listText = listResult.content[0]?.type === "text" ? listResult.content[0].text : "";
		expect(listText).toContain("bg-1");
		expect(listText).toContain("pid 4242");

		const logResult = await harness.executeTool("bg_task", { action: "log", id: "bg-1" });
		const logText = logResult.content[0]?.type === "text" ? logResult.content[0].text : "";
		expect(logText).toContain("READY");

		child.emit("close", 0);
		expect(harness.sendMessage).toHaveBeenCalledTimes(2);
		expect(harness.sendMessage.mock.calls[1]?.[0].content[0].text).toContain("Status: completed (exit 0)");
		const stopFinished = await harness.executeTool("bg_task", { action: "stop", id: "bg-1" });
		const stopFinishedText = stopFinished.content[0]?.type === "text" ? stopFinished.content[0].text : "";
		expect(stopFinishedText).toContain("already completed");

		const unknownResult = await harness.executeTool("bg_task", { action: "stop", id: "missing" });
		expect(unknownResult.isError).toBe(true);

		const logFile = spawnText.match(/Log: (.+)/)?.[1]?.trim();
		expect(logFile).toBeTruthy();
		expect(logFile ? existsSync(logFile) : false).toBe(true);

		const clearResult = await harness.executeTool("bg_task", { action: "clear" });
		const clearText = clearResult.content[0]?.type === "text" ? clearResult.content[0].text : "";
		expect(clearText).toContain("Removed 1 finished background task");
		expect(logFile ? existsSync(logFile) : true).toBe(false);
	});

	it("supports bg_status pid validation and compatibility actions", async () => {
		const harness = createHarness(cwd);
		const { default: registerBackgroundTasksExtension } = await import("../lib/background-tasks/extension");
		registerBackgroundTasksExtension(harness.pi);
		await harness.emitSessionStart();
		await harness.executeTool("bg_task", { action: "spawn", command: "echo hi" });

		const missingPid = await harness.executeTool("bg_status", { action: "log" });
		expect(missingPid.isError).toBe(true);

		const unknownPid = await harness.executeTool("bg_status", { action: "stop", pid: 99999 });
		expect(unknownPid.isError).toBe(true);

		const list = await harness.executeTool("bg_status", { action: "list" });
		const listText = list.content[0]?.type === "text" ? list.content[0].text : "";
		expect(listText).toContain("pid 4242");

		const stop = await harness.executeTool("bg_status", { action: "stop", pid: 4242 });
		const stopText = stop.content[0]?.type === "text" ? stop.content[0].text : "";
		expect(stopText).toContain("Stopping bg-1");
	});

	it("fails closed when sandboxing is disabled, no-sandbox is active, the binary is unavailable, or cwd is missing", async () => {
		const disabledConfigCwd = join(rootDir, "disabled-repo");
		mkdirSync(join(disabledConfigCwd, ".pi"), { recursive: true });
		writeFileSync(join(disabledConfigCwd, ".pi", "heimdall.jsonc"), `{ "sandbox": { "enabled": false } }`);

		const { default: registerBackgroundTasksExtension } = await import("../lib/background-tasks/extension");

		const disabledHarness = createHarness(disabledConfigCwd);
		registerBackgroundTasksExtension(disabledHarness.pi);
		await disabledHarness.emitSessionStart();
		const disabled = await disabledHarness.executeTool("bg_task", { action: "spawn", command: "echo hi" });
		expect(disabled.isError).toBe(true);
		expect(launchCalls).toHaveLength(0);

		const noSandboxHarness = createHarness(cwd, true);
		registerBackgroundTasksExtension(noSandboxHarness.pi);
		await noSandboxHarness.emitSessionStart();
		const noSandbox = await noSandboxHarness.executeTool("bg_task", { action: "spawn", command: "echo hi" });
		expect(noSandbox.isError).toBe(true);
		expect(launchCalls).toHaveLength(0);

		mockBinaryFound = false;
		const binaryHarness = createHarness(cwd);
		registerBackgroundTasksExtension(binaryHarness.pi);
		await binaryHarness.emitSessionStart();
		const missingBinary = await binaryHarness.executeTool("bg_task", { action: "spawn", command: "echo hi" });
		expect(missingBinary.isError).toBe(true);
		expect(launchCalls).toHaveLength(0);

		mockBinaryFound = true;
		const missingCwdHarness = createHarness(cwd);
		registerBackgroundTasksExtension(missingCwdHarness.pi);
		await missingCwdHarness.emitSessionStart();
		const missingCwd = await missingCwdHarness.executeTool("bg_task", {
			action: "spawn",
			command: "echo hi",
			cwd: join(rootDir, "does-not-exist"),
		});
		expect(missingCwd.isError).toBe(true);

		mockLaunchError = new Error("invalid sandbox policy");
		const invalidPolicyHarness = createHarness(cwd);
		registerBackgroundTasksExtension(invalidPolicyHarness.pi);
		await invalidPolicyHarness.emitSessionStart();
		const invalidPolicy = await invalidPolicyHarness.executeTool("bg_task", { action: "spawn", command: "echo hi" });
		expect(invalidPolicy.isError).toBe(true);
	});

	it("truncates visible log tails and cleans up logs on session shutdown", async () => {
		const harness = createHarness(cwd);
		const { default: registerBackgroundTasksExtension } = await import("../lib/background-tasks/extension");
		registerBackgroundTasksExtension(harness.pi);
		await harness.emitSessionStart();
		const spawnResult = await harness.executeTool("bg_task", { action: "spawn", command: "echo huge" });
		const spawnText = spawnResult.content[0]?.type === "text" ? spawnResult.content[0].text : "";
		const logFile = spawnText.match(/Log: (.+)/)?.[1]?.trim() ?? "";

		const child = createdChildren.at(-1)!;
		child.stdout.emit("data", Buffer.from("x".repeat(6000)));
		const logResult = await harness.executeTool("bg_task", { action: "log", id: "bg-1" });
		const logText = logResult.content[0]?.type === "text" ? logResult.content[0].text : "";
		expect(logText).toContain("[...truncated]");
		expect(existsSync(logFile)).toBe(true);

		await harness.emitSessionShutdown();
		expect(child.kill).toHaveBeenCalledWith("SIGTERM");
		expect(existsSync(logFile)).toBe(false);
	});

	it("redacts secret values from bg_task, bg_status, and follow-up messages", async () => {
		process.env.MY_SECRET_TOKEN = "top-secret";
		writeFileSync(join(cwd, ".env.json"), JSON.stringify({ MY_SECRET_TOKEN: "" }));
		const harness = createHarness(cwd);
		const { default: registerBackgroundTasksExtension } = await import("../lib/background-tasks/extension");
		registerBackgroundTasksExtension(harness.pi);
		await harness.emitSessionStart();
		await harness.executeTool("bg_task", { action: "spawn", command: "echo secret" });

		const child = createdChildren.at(-1)!;
		child.stdout.emit("data", Buffer.from("MY_SECRET_TOKEN=top-secret\n"));
		await vi.advanceTimersByTimeAsync(BG_OUTPUT_SETTLE_MS);

		const bgTaskLog = await harness.executeTool("bg_task", { action: "log", id: "bg-1" });
		const bgTaskText = bgTaskLog.content[0]?.type === "text" ? bgTaskLog.content[0].text : "";
		expect(bgTaskText).toContain("[REDACTED]");
		expect(bgTaskText).not.toContain("top-secret");

		const bgStatusLog = await harness.executeTool("bg_status", { action: "log", pid: 4242 });
		const bgStatusText = bgStatusLog.content[0]?.type === "text" ? bgStatusLog.content[0].text : "";
		expect(bgStatusText).toContain("[REDACTED]");
		expect(bgStatusText).not.toContain("top-secret");

		expect(harness.sendMessage.mock.calls[0]?.[0].content[0].text).toContain("[REDACTED]");
		child.emit("close", 0);
		expect(harness.sendMessage.mock.calls[1]?.[0].content[0].text).toContain("[REDACTED]");
	});

	it("blocks command-policy, secret-key, kubectl, and sops preflight checks before launch", async () => {
		process.env.MY_SECRET_TOKEN = "top-secret";
		writeFileSync(join(cwd, ".env.json"), JSON.stringify({ MY_SECRET_TOKEN: "" }));
		writeFileSync(join(cwd, ".pi", "heimdall.jsonc"), JSON.stringify({
			sandbox: { enabled: true },
			commandPolicies: [{ name: "no-cargo-test", blocked: ["cargo", "test"], message: "Use mise test." }],
		}));
		const harness = createHarness(cwd);
		const { default: registerBackgroundTasksExtension } = await import("../lib/background-tasks/extension");
		registerBackgroundTasksExtension(harness.pi);
		await harness.emitSessionStart();

		for (const command of [
			"cargo test",
			"echo $MY_SECRET_TOKEN",
			"kubectl get secrets",
			"sops decrypt secrets.enc.yaml",
		]) {
			const result = await harness.executeTool("bg_task", { action: "spawn", command });
			expect(result.isError).toBe(true);
		}
		expect(launchCalls).toHaveLength(0);
	});
});

class FakeChild extends EventEmitter {
	pid = 4242;
	stdout = new EventEmitter();
	stderr = new EventEmitter();
	stdin = { end: vi.fn() };
	kill = vi.fn((signal?: string) => {
		queueMicrotask(() => this.emit("close", signal === "SIGKILL" ? null : 0));
		return true;
	});
}

function createFakeChild(): ChildProcessWithoutNullStreams {
	return new FakeChild() as unknown as ChildProcessWithoutNullStreams;
}

function createHarness(cwd: string, noSandbox = false) {
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
		getFlag: vi.fn((name: string) => (name === "no-sandbox" ? noSandbox : false)),
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

	return {
		ctx,
		notify,
		pi,
		sendMessage,
		async emitSessionStart() {
			for (const handler of handlers.get("session_start") ?? []) {
				await handler({}, ctx);
			}
		},
		async emitSessionShutdown() {
			for (const handler of handlers.get("session_shutdown") ?? []) {
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
