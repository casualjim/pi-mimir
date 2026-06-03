import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

let mockAgentDir = "";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return {
		...actual,
		getAgentDir: () => mockAgentDir,
	};
});

describe("background task extension registration", () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = join(tmpdir(), `heimdall-bg-registration-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		mockAgentDir = join(rootDir, "agent");
		mkdirSync(mockAgentDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
		vi.resetModules();
	});

	it("core heimdall does not register background task surfaces", async () => {
		const tools: string[] = [];
		const commands: string[] = [];
		const shortcuts: string[] = [];
		const { default: heimdall } = await import("../extensions/heimdall");

		heimdall(createHarness({ commands, shortcuts, tools }));

		expect(tools).toContain("bash");
		expect(tools).not.toContain("bg_task");
		expect(tools).not.toContain("bg_status");
		expect(commands).not.toContain("bg");
		expect(shortcuts).not.toContain("ctrl+shift+b");
	});

	it("background-task extension registers bg_task, bg_status, /bg, and ctrl+shift+b without an extra config flag", async () => {
		const tools: string[] = [];
		const commands: string[] = [];
		const shortcuts: string[] = [];
		const { default: heimdallBackgroundTasks } = await import("../extensions/heimdall-bg-tasks");

		heimdallBackgroundTasks(createHarness({ commands, shortcuts, tools }));

		expect(tools).toContain("bg_task");
		expect(tools).toContain("bg_status");
		expect(commands).toContain("bg");
		expect(shortcuts).toContain("ctrl+shift+b");
	});
});

function createHarness(sinks: { tools: string[]; commands: string[]; shortcuts: string[] }): ExtensionAPI {
	return {
		exec: vi.fn(),
		getActiveTools: vi.fn(() => []),
		getAllTools: vi.fn(() => []),
		getCommands: vi.fn(() => []),
		getFlag: vi.fn(() => false),
		getSessionName: vi.fn(() => undefined),
		getThinkingLevel: vi.fn(() => "off"),
		on: vi.fn(),
		registerCommand: vi.fn((name: string) => {
			sinks.commands.push(name);
		}),
		registerFlag: vi.fn(),
		registerMessageRenderer: vi.fn(),
		registerProvider: vi.fn(),
		registerShortcut: vi.fn((shortcut: string) => {
			sinks.shortcuts.push(shortcut);
		}),
		registerTool: vi.fn((tool: { name: string }) => {
			sinks.tools.push(tool.name);
		}),
		appendEntry: vi.fn(),
		sendMessage: vi.fn(),
		sendUserMessage: vi.fn(),
		setActiveTools: vi.fn(),
		setLabel: vi.fn(),
		setModel: vi.fn(),
		setSessionName: vi.fn(),
		setThinkingLevel: vi.fn(),
		unregisterProvider: vi.fn(),
		events: { emit: vi.fn(), on: vi.fn() },
	} as unknown as ExtensionAPI;
}
