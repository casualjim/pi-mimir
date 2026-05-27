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

	function createSessionHarness(toolNames: string[] = []) {
		const harness = createHarness({
			execStubs: {
				"git rev-parse --abbrev-ref HEAD": { code: 128, stdout: "", stderr: "not a repo" },
				"git rev-parse --short HEAD": { code: 128, stdout: "", stderr: "not a repo" },
			},
			toolNames,
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

		it("warns with the exact install command when codebase-memory support is missing", async () => {
			const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
			process.env.PI_OPENSPEC_TEST_HOME = projectDir;
			try {
				const harness = createSessionHarness();
				await harness.emit("session_start", {}, { cwd: projectDir, hasUI: true });
				expect(harness.notifications.some((n) => n.message.includes("pi install @casualjim/pi-codebase-memory") && n.level === "warning")).toBe(true);
			} finally {
				if (oldHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
				else process.env.PI_OPENSPEC_TEST_HOME = oldHome;
			}
		});

		it("warns that degraded discovery is active when plugin is installed but tools are unavailable", async () => {
			const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
			process.env.PI_OPENSPEC_TEST_HOME = projectDir;
			mkdirSync(join(projectDir, ".pi", "agent"), { recursive: true });
			writeFileSync(join(projectDir, ".pi", "agent", "settings.json"), JSON.stringify({ packages: ["@casualjim/pi-codebase-memory"] }), "utf-8");
			try {
				const harness = createSessionHarness();
				await harness.emit("session_start", {}, { cwd: projectDir, hasUI: true });
				expect(harness.notifications.some((n) => n.message.includes("still inactive in this session") && n.message.includes("Degraded discovery") && n.level === "warning")).toBe(true);
			} finally {
				if (oldHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
				else process.env.PI_OPENSPEC_TEST_HOME = oldHome;
			}
		});

		it("does not warn when required codebase-memory tools are active", async () => {
			const harness = createSessionHarness([
				"codebase_memory_get_architecture",
				"codebase_memory_search_graph",
				"codebase_memory_search_code",
				"codebase_memory_trace_path",
				"codebase_memory_get_code_snippet",
			]);
			await harness.emit("session_start", {}, { cwd: projectDir, hasUI: true });
			expect(harness.notifications.some((n) => n.message.includes("pi install @casualjim/pi-codebase-memory"))).toBe(false);
		});

		it("injects workflow guidance and codebase-memory guidance as session context", async () => {
			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir });
			expect(harness.sentMessages.some((m) => m.customType === "openspec-workflow-guidance")).toBe(true);
			expect(harness.sentMessages.some((m) => m.customType === "openspec-codebase-memory-guidance")).toBe(true);
		});
	});

	describe("tool_call", () => {
		it("does not emit the generic raw-discovery reminder anymore", async () => {
			const harness = createSessionHarness();
			await harness.emit("session_start", {}, { cwd: projectDir });
			harness.reset();
			await harness.emit("tool_call", { toolName: "grep", input: { pattern: "x" } }, { cwd: projectDir });
			expect(harness.sentMessages.some((m) => m.customType.includes("codebase-memory-tool-guidance"))).toBe(false);
		});
	});
});
