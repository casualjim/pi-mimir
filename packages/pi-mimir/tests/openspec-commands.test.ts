import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHarness } from "./helpers/pi-harness.js";
import {
	ensureReviewGatedOpenSpecConfig,
	registerOpenSpecCommands,
	syncBundledSkills,
} from "../extensions/openspec/openspec-commands.js";
import { OPENSPEC_CLI_OUTPUT_MESSAGE } from "../extensions/openspec/openspec-output-renderer.js";
import { registerUpdateAgentsCommand } from "../extensions/openspec/update-agents.js";

describe("review-gated OpenSpec config", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `openspec-config-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("creates openspec/config.yaml with review-gated schema", () => {
		const result = ensureReviewGatedOpenSpecConfig(cwd);

		expect(result.created).toBe(true);
		expect(readFileSync(join(cwd, "openspec", "config.yaml"), "utf-8")).toBe("schema: review-gated\n");
	});

	it("replaces the default spec-driven schema and preserves other config", () => {
		mkdirSync(join(cwd, "openspec"), { recursive: true });
		writeFileSync(join(cwd, "openspec", "config.yaml"), "schema: spec-driven\nfoo: bar\n", "utf-8");

		const result = ensureReviewGatedOpenSpecConfig(cwd);

		expect(result.updated).toBe(true);
		expect(readFileSync(join(cwd, "openspec", "config.yaml"), "utf-8")).toBe("schema: review-gated\nfoo: bar\n");
	});
});

describe("bundled skill sync", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `openspec-skills-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("does not copy packaged skills into .pi/skills", () => {
		const result = syncBundledSkills(cwd);

		expect(result).toEqual({ added: [], updated: [], removed: [] });
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(false);
		expect(existsSync(join(cwd, ".pi", "mimir-managed.json"))).toBe(false);
	});

	it("prunes unchanged legacy copied skills and clears manifest tracking", () => {
		mkdirSync(join(cwd, ".pi", "skills", "plan"), { recursive: true });
		writeFileSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"), "# legacy\n", "utf-8");
		writeFileSync(join(cwd, ".pi", "mimir-managed.json"), JSON.stringify({ skills: { plan: "3fff697edcad92c7838f4f1ab43a4704c8c79f4bf3775bfed584e978b8a05953" } }), "utf-8");

		const result = syncBundledSkills(cwd);

		expect(result.removed).toContain("plan");
		expect(existsSync(join(cwd, ".pi", "skills", "plan"))).toBe(false);
	});

	it("preserves user-modified legacy copied skills", () => {
		mkdirSync(join(cwd, ".pi", "skills", "plan"), { recursive: true });
		writeFileSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"), "# user modified\n", "utf-8");
		writeFileSync(join(cwd, ".pi", "mimir-managed.json"), JSON.stringify({ skills: { plan: "1e9a848b3d7fe05f48a8fbc7451e5d57af00e34a8be2d59a61fc7cdbfd9017c4" } }), "utf-8");

		const result = syncBundledSkills(cwd);

		expect(result.removed).not.toContain("plan");
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(true);
	});
});

describe("/openspec:* commands", () => {
	let cwd: string;
	let oldXdg: string | undefined;
	let oldPiOpenSpecHome: string | undefined;

	beforeEach(() => {
		cwd = join(tmpdir(), `openspec-command-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		mkdirSync(cwd, { recursive: true });
		oldXdg = process.env.XDG_DATA_HOME;
		oldPiOpenSpecHome = process.env.PI_OPENSPEC_TEST_HOME;
		process.env.XDG_DATA_HOME = join(cwd, ".xdg");
		process.env.PI_OPENSPEC_TEST_HOME = cwd;
	});

	afterEach(() => {
		if (oldXdg === undefined) delete process.env.XDG_DATA_HOME;
		else process.env.XDG_DATA_HOME = oldXdg;
		if (oldPiOpenSpecHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
		else process.env.PI_OPENSPEC_TEST_HOME = oldPiOpenSpecHome;
		rmSync(cwd, { recursive: true, force: true });
	});

	it("registers init/status/list and maps status/list to OpenSpec CLI", async () => {
		const harness = createHarness({
			execStubs: {
				"openspec view": { code: 0, stdout: "dashboard", stderr: "" },
				"openspec list": { code: 0, stdout: "changes", stderr: "" },
			},
		});
		registerOpenSpecCommands(harness.pi);

		expect(harness.commands.has("openspec:init")).toBe(true);
		expect(harness.commands.has("openspec:status")).toBe(true);
		expect(harness.commands.has("openspec:list")).toBe(true);
		expect(harness.messageRenderers.has(OPENSPEC_CLI_OUTPUT_MESSAGE)).toBe(true);

		await harness.commands.get("openspec:status")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });
		await harness.commands.get("openspec:list")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });

		expect(harness.notifications).toEqual([]);
		expect(harness.sentMessages.map((m) => m.content)).toEqual(["dashboard", "changes"]);
	});

	it("syncs workflow assets first, then reports incomplete setup when codebase-memory tools are unavailable", async () => {
		const harness = createHarness({
			execStubs: {
				"openspec init --tools pi": { code: 0, stdout: "initialized", stderr: "" },
			},
			toolNames: [],
		});
		registerOpenSpecCommands(harness.pi);

		await harness.commands.get("openspec:init")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });

		expect(readFileSync(join(cwd, "openspec", "config.yaml"), "utf-8")).toContain("schema: review-gated");
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(false);
		expect(existsSync(join(cwd, ".pi", "agents"))).toBe(false);
		expect(existsSync(join(cwd, ".pi", "agent", "mcp.json"))).toBe(false);
		expect(harness.notifications.at(-1)?.message).toContain("Workflow setup is incomplete");
		expect(harness.notifications.at(-1)?.message).toContain("pi install @casualjim/pi-codebase-memory");
		expect(harness.notifications.at(-1)?.level).toBe("warning");
	});

	it("reports complete setup when codebase-memory tools are active", async () => {
		const harness = createHarness({
			execStubs: {
				"openspec init --tools pi": { code: 0, stdout: "initialized", stderr: "" },
			},
			toolNames: [
				"codebase_memory_get_architecture",
				"codebase_memory_search_graph",
				"codebase_memory_search_code",
				"codebase_memory_trace_path",
				"codebase_memory_get_code_snippet",
			],
		});
		registerOpenSpecCommands(harness.pi);

		await harness.commands.get("openspec:init")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });

		expect(harness.notifications.at(-1)?.message).toContain("codebase-memory support is active");
		expect(harness.notifications.at(-1)?.level).toBe("info");
	});

	it("runs openspec update, then refreshes schema, skills, agents, and manifests", async () => {
		const harness = createHarness({
			execStubs: {
				"openspec update": { code: 0, stdout: "updated", stderr: "" },
			},
			toolNames: [],
		});
		registerUpdateAgentsCommand(harness.pi);

		await harness.commands.get("openspec:update")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });

		expect(harness.execCalls.some((call) => call.cmd === "openspec" && call.args.join(" ") === "update")).toBe(true);
		expect(readFileSync(join(cwd, "openspec", "config.yaml"), "utf-8")).toContain("schema: review-gated");
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(false);
		expect(existsSync(join(cwd, ".pi", "agents"))).toBe(false);
		expect(existsSync(join(cwd, ".pi", "mimir-managed.json"))).toBe(true);
		expect(harness.notifications.at(-1)?.message).toContain("Workflow setup is incomplete");
		expect(harness.notifications.at(-1)?.message).toContain("pi install @casualjim/pi-codebase-memory");
	});
});
