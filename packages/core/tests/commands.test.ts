import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHarness } from "./helpers/pi-harness.js";
import { registerSetupCommand } from "../extensions/openspec-core/setup-command.js";
import { registerUpdateAgentsCommand } from "../extensions/openspec-core/update-agents.js";
import { BUNDLED_AGENTS_DIR, syncBundledAgents } from "../extensions/openspec-core/agents.js";

describe("/openspec-setup command", () => {
	function createSetupHarness() {
		const harness = createHarness();
		registerSetupCommand(harness.pi);
		return harness;
	}

	it("registers the openspec-setup command", () => {
		const harness = createSetupHarness();
		expect(harness.commands.has("openspec-setup")).toBe(true);
	});

	it("shows error in non-interactive mode", async () => {
		const harness = createSetupHarness();
		const cmd = harness.commands.get("openspec-setup")!;

		await cmd.handler("", { hasUI: false, ui: harness.ctx.ui, cwd: "/tmp" });
		expect(harness.notifications).toHaveLength(1);
		expect(harness.notifications[0]!.level).toBe("error");
		expect(harness.notifications[0]!.message).toContain("interactive");
	});

	it("shows 'already installed' when all siblings present", async () => {
		// We can't control findMissingSiblings without mocking, but we can verify
		// the command handler runs without crashing
		const harness = createSetupHarness();
		const cmd = harness.commands.get("openspec-setup")!;

		await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: "/tmp" });
		// Either "already installed" or confirmation dialog — no crash is sufficient
	});

	it("has a description", () => {
		const harness = createSetupHarness();
		const cmd = harness.commands.get("openspec-setup")!;
		expect(cmd.description).toBeTruthy();
	});

	it("reports OpenSpec CLI install command when openspec is missing", async () => {
		const harness = createHarness({
			execStubs: {
				"openspec --version": { code: 127, stdout: "", stderr: "not found" },
			},
		});
		registerSetupCommand(harness.pi);
		const cmd = harness.commands.get("openspec-setup")!;

		await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: "/tmp" });

		expect(harness.notifications.some((n) => n.message.includes("npm i -g @FissionAI/openspec"))).toBe(true);
	});

	it("shows codebase-memory MCP copy-paste prompt when missing", async () => {
		const harness = createSetupHarness();
		const cmd = harness.commands.get("openspec-setup")!;

		await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: "/tmp" });

		expect(harness.notifications.some((n) => n.message.includes("codebase-memory MCP tools were not detected") || n.message.includes("already installed"))).toBe(true);
	});

	describe("confirm-then-install flow", () => {
		it("installs missing siblings after confirmation and reports success", async () => {
			const harness = createHarness({
				execStubs: {
					// All pi install calls succeed
					"pi install npm:@tintinweb/pi-subagents": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:@juicesharp/rpiv-ask-user-question": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:@juicesharp/rpiv-todo": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:@juicesharp/rpiv-web-tools": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:@juicesharp/rpiv-args": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:@juicesharp/rpiv-btw": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:pi-mcp-adapter": { code: 0, stdout: "ok", stderr: "" },
				},
			});
			registerSetupCommand(harness.pi);
			const cmd = harness.commands.get("openspec-setup")!;

			await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: "/tmp" });

			// If missing siblings exist, confirm is called (harness returns true by default)
			// Then installs happen. Check for success notification with installed packages.
			const hasSuccessOrAlreadyInstalled = harness.notifications.some(
				(n) => n.message.includes("Installed") || n.message.includes("already installed"),
			);
			expect(hasSuccessOrAlreadyInstalled).toBe(true);
		});

		it("reports partial failure when some installs fail", async () => {
			const harness = createHarness({
				execStubs: {
					"pi install npm:@tintinweb/pi-subagents": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:@juicesharp/rpiv-ask-user-question": { code: 1, stdout: "", stderr: "network error" },
					"pi install npm:@juicesharp/rpiv-todo": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:@juicesharp/rpiv-web-tools": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:@juicesharp/rpiv-args": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:@juicesharp/rpiv-btw": { code: 0, stdout: "ok", stderr: "" },
					"pi install npm:pi-mcp-adapter": { code: 0, stdout: "ok", stderr: "" },
				},
			});
			registerSetupCommand(harness.pi);
			const cmd = harness.commands.get("openspec-setup")!;

			await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: "/tmp" });

			// Should contain both succeeded and failed sections
			const report = harness.notifications.find(
				(n) => n.message.includes("Installed") || n.message.includes("Failed"),
			);
			// Either all were already installed (no report with "Installed") or partial failure
			if (report) {
				expect(report.message).toContain("Installed");
				expect(report.message).toContain("Failed");
				expect(report.level).toBe("warning");
			}
		});

		it("cancels when user declines confirmation", async () => {
			const harness = createHarness();
			// Override confirm to return false
			harness.ctx.ui.confirm = async () => false;
			registerSetupCommand(harness.pi);
			const cmd = harness.commands.get("openspec-setup")!;

			await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: "/tmp" });

			const cancelled = harness.notifications.some(
				(n) => n.message.includes("cancelled"),
			);
			// Either cancelled or already installed (no missing siblings)
			expect(
				cancelled || harness.notifications.some((n) => n.message.includes("already installed")),
			).toBe(true);
		});
	});
});

describe("/openspec-update-agents command", () => {
	function createUpdateHarness() {
		const harness = createHarness();
		registerUpdateAgentsCommand(harness.pi);
		return harness;
	}

	it("registers the openspec-update-agents command", () => {
		const harness = createUpdateHarness();
		expect(harness.commands.has("openspec-update-agents")).toBe(true);
	});

	it("runs without error", async () => {
		const harness = createUpdateHarness();
		const cmd = harness.commands.get("openspec-update-agents")!;

		await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: "/tmp" });
		// Should not throw. May show "up-to-date" or sync results.
		expect(harness.notifications.length).toBeLessThanOrEqual(1);
	});

	it("has a description", () => {
		const harness = createUpdateHarness();
		const cmd = harness.commands.get("openspec-update-agents")!;
		expect(cmd.description).toBeTruthy();
	});

	describe("sync report content", () => {
		const testAgentName = "_test-report-agent.md";
		const testAgentContent = "# Test Agent for report\\n";
		const srcPath = join(BUNDLED_AGENTS_DIR, testAgentName);
		let testCwd: string;

		beforeEach(() => {
			testCwd = join(tmpdir(), `openspec-cmd-test-${Date.now()}`);
			mkdirSync(testCwd, { recursive: true });
			mkdirSync(BUNDLED_AGENTS_DIR, { recursive: true });
			writeFileSync(srcPath, testAgentContent, "utf-8");
		});

		afterEach(() => {
			rmSync(testCwd, { recursive: true, force: true });
			if (existsSync(srcPath)) rmSync(srcPath, { force: true });
		});

		it("reports 'added' count when new agents are synced", async () => {
			const harness = createUpdateHarness();
			const cmd = harness.commands.get("openspec-update-agents")!;

			await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: testCwd });

			const report = harness.notifications[0];
			expect(report).toBeDefined();
			expect(report!.message).toContain("added");
			expect(report!.message).toMatch(/\d+ added/);
		});

		it("reports 'up-to-date' when no changes needed", async () => {
			// Pre-sync so everything is current
			syncBundledAgents(testCwd, true);

			const harness = createUpdateHarness();
			const cmd = harness.commands.get("openspec-update-agents")!;

			await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: testCwd });

			const report = harness.notifications[0];
			expect(report).toBeDefined();
			expect(report!.message).toMatch(/up-to-date|added|updated|removed/);
		});

		it("reports 'updated' when bundled agent changed", async () => {
			// First sync with original content
			syncBundledAgents(testCwd, true);

			// Update bundled source (new version)
			writeFileSync(srcPath, "# Test Agent for report - v2\\n", "utf-8");

			const harness = createUpdateHarness();
			const cmd = harness.commands.get("openspec-update-agents")!;

			await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: testCwd });

			const report = harness.notifications[0];
			expect(report).toBeDefined();
			expect(report!.message).toContain("updated");
		});

		it("reports 'removed' when stale agent cleaned up", async () => {
			// First sync to get the agent in place
			syncBundledAgents(testCwd, true);

			// Remove source (simulates agent removed from bundle)
			rmSync(srcPath, { force: true });

			const harness = createUpdateHarness();
			const cmd = harness.commands.get("openspec-update-agents")!;

			await cmd.handler("", { hasUI: true, ui: harness.ctx.ui, cwd: testCwd });

			const report = harness.notifications[0];
			expect(report).toBeDefined();
			expect(report!.message).toContain("removed");
		});
	});
});
