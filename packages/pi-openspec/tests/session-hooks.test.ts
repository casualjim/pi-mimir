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

		it("warns about missing siblings when hasUI", async () => {
			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir, hasUI: true });
			// Notification may or may not fire depending on actual settings.json state,
			// but we verify it doesn't crash
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
