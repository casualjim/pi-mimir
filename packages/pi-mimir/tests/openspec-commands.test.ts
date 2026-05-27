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

	it("copies packaged skills into .pi/skills", () => {
		const result = syncBundledSkills(cwd);

		expect(result.added).toContain("plan");
		expect(result.added).toContain("review-architecture");
		expect(result.added).toContain("review-data-flow");
		expect(result.added).toContain("review-security");
		expect(result.added).toContain("review-tests");
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "skills", "implement", "SKILL.md"))).toBe(true);
		const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8"));
		expect(manifest.skills.plan).toMatch(/^[a-f0-9]{64}$/);
	});

	it("tracks a multi-file skill with one folder merkle hash", () => {
		const extraDir = join("skillseeds", "plan", "_test-assets");
		const extraFile = join(extraDir, "nested.txt");
		mkdirSync(extraDir, { recursive: true });
		writeFileSync(extraFile, "nested skill asset\n", "utf-8");
		try {
			syncBundledSkills(cwd);
			const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8"));
			expect(existsSync(join(cwd, ".pi", "skills", "plan", "_test-assets", "nested.txt"))).toBe(true);
			expect(manifest.skills.plan).toMatch(/^[a-f0-9]{64}$/);
		} finally {
			rmSync(extraDir, { recursive: true, force: true });
		}
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
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "agents"))).toBe(true);
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
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "agents"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "mimir-managed.json"))).toBe(true);
		expect(harness.notifications.at(-1)?.message).toContain("Workflow setup is incomplete");
		expect(harness.notifications.at(-1)?.message).toContain("pi install @casualjim/pi-codebase-memory");
	});
});
