import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHarness } from "./helpers/pi-harness.js";
import { resetInjectedMarker, clearGitContextCache } from "../extensions/openspec/git-context.js";
import { clearInjectionState } from "../extensions/openspec/guidance.js";
import { registerSessionHooks } from "../extensions/openspec/session-hooks.js";

describe("session-hooks", () => {
	let projectDir: string;

	beforeEach(() => {
		clearInjectionState();
		clearGitContextCache();
		resetInjectedMarker();
		projectDir = join(tmpdir(), `openspec-session-test-${Date.now()}`);
		mkdirSync(projectDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(projectDir, { recursive: true, force: true });
	});

	function createSessionHarness() {
		const harness = createHarness({
			execStubs: {
				// Return git context that looks like a repo
				"git rev-parse --abbrev-ref HEAD": { code: 128, stdout: "", stderr: "not a repo" },
				"git rev-parse --short HEAD": { code: 128, stdout: "", stderr: "not a repo" },
			},
		});
		registerSessionHooks(harness.pi);
		return harness;
	}

	describe("session_start", () => {
		it("scaffolds openspec/changes/ and openspec/profiles/", async () => {
			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir });
			expect(existsSync(join(projectDir, "openspec", "changes"))).toBe(true);
			expect(existsSync(join(projectDir, "openspec", "profiles"))).toBe(true);
		});

		it("sends git context message when in a git repo", async () => {
			const harness = createHarness({
				execStubs: {
					"git rev-parse --abbrev-ref HEAD": { code: 0, stdout: "main", stderr: "" },
					"git rev-parse --short HEAD": { code: 0, stdout: "abc1234", stderr: "" },
					"git config user.name": { code: 0, stdout: "Test", stderr: "" },
				},
			});
			registerSessionHooks(harness.pi);

			await harness.emit("session_start", {}, { cwd: projectDir });
			const gitMsg = harness.sentMessages.find((m) => m.customType === "openspec-git-context");
			expect(gitMsg).toBeDefined();
			expect(gitMsg!.content).toContain("Branch: main");
		});

		it("does not send git context when not a git repo", async () => {
			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir });
			const gitMsg = harness.sentMessages.find((m) => m.customType === "openspec-git-context");
			expect(gitMsg).toBeUndefined();
		});

		it("injects root guidance if .rpiv/guidance/architecture.md exists", async () => {
			mkdirSync(join(projectDir, ".rpiv", "guidance"), { recursive: true });
			writeFileSync(join(projectDir, ".rpiv", "guidance", "architecture.md"), "# Root arch");

			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir });

			const guidance = harness.sentMessages.find((m) => m.customType === "openspec-guidance");
			expect(guidance).toBeDefined();
			expect(guidance!.content).toContain("Root arch");
		});

		it("warns about missing codebase-memory MCP when hasUI", async () => {
			const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
			process.env.PI_OPENSPEC_TEST_HOME = projectDir;
			try {
				const harness = createSessionHarness();
				await harness.emit("session_start", {}, { cwd: projectDir, hasUI: true });
				expect(harness.notifications.some((n) => n.message.includes("codebase-memory MCP is required") && n.level === "warning")).toBe(true);
			} finally {
				if (oldHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
				else process.env.PI_OPENSPEC_TEST_HOME = oldHome;
			}
		});

		it("injects workflow guidance for plan/implement, degraded discovery, and no PR implementation", async () => {
			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir });
			const guidance = harness.sentMessages.find((m) => m.customType === "openspec-workflow-guidance");
			expect(guidance).toBeDefined();
			expect(guidance!.content).toContain("plan");
			expect(guidance!.content).toContain("implement");
			expect(guidance!.content).toContain("degraded discovery");
			expect(guidance!.content).toContain("PR creation");
		});

		it("injects codebase-memory indexing guidance as session context", async () => {
			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir });
			const guidance = harness.sentMessages.find((m) => m.customType === "openspec-codebase-memory-guidance");
			expect(guidance).toBeDefined();
			expect(guidance!.content).toContain("codebase_memory_index_repository");
			expect(guidance!.content).toContain("codebase_memory_get_architecture");
			expect(guidance!.content).toContain("degraded discovery");
		});
	});

	describe("session_compact", () => {
		it("re-injects root guidance and git context", async () => {
			mkdirSync(join(projectDir, ".rpiv", "guidance"), { recursive: true });
			writeFileSync(join(projectDir, ".rpiv", "guidance", "architecture.md"), "# Root arch");

			const harness = createHarness({
				execStubs: {
					"git rev-parse --abbrev-ref HEAD": { code: 0, stdout: "main", stderr: "" },
					"git rev-parse --short HEAD": { code: 0, stdout: "abc1234", stderr: "" },
					"git config user.name": { code: 0, stdout: "Test", stderr: "" },
				},
			});
			registerSessionHooks(harness.pi);

			await harness.emit("session_start", {}, { cwd: projectDir });
			harness.reset();

			await harness.emit("session_compact", {}, { cwd: projectDir });

			// Should re-inject guidance and git context
			expect(harness.sentMessages.some((m) => m.customType === "openspec-guidance")).toBe(true);
			expect(harness.sentMessages.some((m) => m.customType === "openspec-git-context")).toBe(true);
		});
	});

	describe("session_shutdown", () => {
		it("does not throw", async () => {
			const harness = createSessionHarness();
			await expect(harness.emit("session_shutdown", {}, { cwd: projectDir })).resolves.toBeUndefined();
		});
	});

	describe("tool_call", () => {
		it("advises on first broad raw discovery call without blocking", async () => {
			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir });
			harness.reset();

			const first = await harness.emit("tool_call", { toolName: "grep", input: { pattern: "file" } }, { cwd: projectDir });
			expect(first).toBeUndefined();
			expect(harness.sentMessages.find((m) => m.customType === "openspec-codebase-memory-tool-guidance")?.content).toContain("codebase-memory reminder");

			harness.reset();
			const second = await harness.emit("tool_call", { toolName: "grep", input: { pattern: "file" } }, { cwd: projectDir });
			expect(second).toBeUndefined();
			expect(harness.sentMessages.some((m) => m.customType === "openspec-codebase-memory-tool-guidance")).toBe(false);
		});

		it("does not advise or block read calls", async () => {
			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir });
			harness.reset();

			const result = await harness.emit("tool_call", { toolName: "read", input: { path: join(projectDir, "src", "file.ts") } }, { cwd: projectDir });
			expect(result).toBeUndefined();
			expect(harness.sentMessages.some((m) => m.customType === "openspec-codebase-memory-tool-guidance")).toBe(false);
		});

		it("session_start and session_compact reset the one-shot discovery advisory", async () => {
			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir });
			expect(await harness.emit("tool_call", { toolName: "grep", input: { pattern: "x" } }, { cwd: projectDir })).toBeUndefined();
			expect(harness.sentMessages.some((m) => m.customType === "openspec-codebase-memory-tool-guidance")).toBe(true);
			harness.reset();
			expect(await harness.emit("tool_call", { toolName: "grep", input: { pattern: "x" } }, { cwd: projectDir })).toBeUndefined();
			expect(harness.sentMessages.some((m) => m.customType === "openspec-codebase-memory-tool-guidance")).toBe(false);
			await harness.emit("session_compact", {}, { cwd: projectDir });
			harness.reset();
			expect(await harness.emit("tool_call", { toolName: "grep", input: { pattern: "x" } }, { cwd: projectDir })).toBeUndefined();
			expect(harness.sentMessages.some((m) => m.customType === "openspec-codebase-memory-tool-guidance")).toBe(true);
		});

		it("clears git cache on mutating git commands", async () => {
			let branchName = "main";
			const harness = createHarness({
				execStubs: {
					"git rev-parse --abbrev-ref HEAD": () => Promise.resolve({ code: 0, stdout: branchName, stderr: "" }),
					"git rev-parse --short HEAD": { code: 0, stdout: "abc1234", stderr: "" },
					"git config user.name": { code: 0, stdout: "Test", stderr: "" },
				},
			});
			registerSessionHooks(harness.pi);

			await harness.emit("session_start", {}, { cwd: projectDir });

			// Simulate branch change
			branchName = "feature";

			// Emit a mutating git command — clears cache
			await harness.emit(
				"tool_call",
				{ toolName: "bash", input: { command: "git checkout feature" } },
				{ cwd: projectDir },
			);

			// Next before_agent_start should re-resolve git context with new branch
			const result = await harness.emit("before_agent_start", {}, { cwd: projectDir });
			expect(result?.message?.content).toContain("Branch: feature");
		});

		it("does not clear git cache on non-mutating commands", async () => {
			const harness = createSessionHarness();
			registerSessionHooks(harness.pi);

			await harness.emit("session_start", {}, { cwd: projectDir });
			harness.reset();

			await harness.emit(
				"tool_call",
				{ toolName: "bash", input: { command: "git status" } },
				{ cwd: projectDir },
			);

			// No git context re-injection expected
			expect(harness.sentMessages.some((m) => m.customType === "openspec-git-context")).toBe(false);
		});
	});

	describe("before_agent_start", () => {
		it("returns git context message when context changed", async () => {
			const harness = createHarness({
				execStubs: {
					"git rev-parse --abbrev-ref HEAD": { code: 0, stdout: "main", stderr: "" },
					"git rev-parse --short HEAD": { code: 0, stdout: "abc1234", stderr: "" },
					"git config user.name": { code: 0, stdout: "Test", stderr: "" },
				},
			});
			registerSessionHooks(harness.pi);

			const result = await harness.emit("before_agent_start", {}, { cwd: projectDir });
			expect(result?.message).toBeDefined();
			expect(result.message.customType).toBe("openspec-git-context");
			expect(result.message.content).toContain("Branch: main");
		});

		it("returns undefined when context unchanged", async () => {
			const harness = createHarness({
				execStubs: {
					"git rev-parse --abbrev-ref HEAD": { code: 0, stdout: "main", stderr: "" },
					"git rev-parse --short HEAD": { code: 0, stdout: "abc1234", stderr: "" },
					"git config user.name": { code: 0, stdout: "Test", stderr: "" },
				},
			});
			registerSessionHooks(harness.pi);

			// First call injects
			await harness.emit("before_agent_start", {}, { cwd: projectDir });
			// Second call deduped
			const result = await harness.emit("before_agent_start", {}, { cwd: projectDir });
			expect(result).toBeUndefined();
		});
	});
});
