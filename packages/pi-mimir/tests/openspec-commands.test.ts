import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function sha256(parts: Array<Buffer | string>): string {
	const hash = createHash("sha256");
	for (const part of parts) hash.update(part);
	return hash.digest("hex");
}

function merkleHashDirectory(dir: string): string {
	const entries = readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() || entry.isFile())
		.sort((a, b) => a.name.localeCompare(b.name));
	const parts: Array<Buffer | string> = ["dir\0"];
	for (const entry of entries) {
		const childPath = join(dir, entry.name);
		const childHash = entry.isDirectory()
			? merkleHashDirectory(childPath)
			: sha256(["file\0", readFileSync(childPath)]);
		parts.push(entry.name, "\0", childHash, "\0");
	}
	return sha256(parts);
}

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
		expect(existsSync(join(cwd, ".pi", "skills", "review-architecture", "SKILL.md"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "skills", "review-data-flow", "SKILL.md"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "skills", "review-security", "SKILL.md"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "skills", "review-tests", "SKILL.md"))).toBe(true);
		const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8"));
		expect(manifest.skills.plan).toMatch(/^[a-f0-9]{64}$/);
		expect(manifest.skills["review-architecture"]).toMatch(/^[a-f0-9]{64}$/);
	});

	it("removes stale managed skills that still match the manifest hash", () => {
		const staleDir = join(cwd, ".pi", "skills", "review-performance");
		mkdirSync(staleDir, { recursive: true });
		writeFileSync(join(staleDir, "SKILL.md"), "---\nname: review-performance\n---\n", "utf-8");
		const staleHash = merkleHashDirectory(staleDir);
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		writeFileSync(join(cwd, ".pi", "mimir-managed.json"), JSON.stringify({ skills: { "review-performance": staleHash } }, null, 2), "utf-8");

		const result = syncBundledSkills(cwd);

		expect(result.removed).toContain("review-performance");
		expect(existsSync(staleDir)).toBe(false);
		const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8"));
		expect(manifest.skills["review-performance"]).toBeUndefined();
		expect(manifest.skills["review-data-flow"]).toMatch(/^[a-f0-9]{64}$/);
	});

	it("leaves stale managed skills alone and stops tracking them when users edited them", () => {
		const staleDir = join(cwd, ".pi", "skills", "review-performance");
		mkdirSync(staleDir, { recursive: true });
		writeFileSync(join(staleDir, "SKILL.md"), "---\nname: review-performance\n---\n", "utf-8");
		const staleHash = merkleHashDirectory(staleDir);
		writeFileSync(join(staleDir, "SKILL.md"), "---\nname: review-performance\n---\n# locally edited\n", "utf-8");
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		writeFileSync(join(cwd, ".pi", "mimir-managed.json"), JSON.stringify({ skills: { "review-performance": staleHash } }, null, 2), "utf-8");

		const result = syncBundledSkills(cwd);

		expect(result.removed).not.toContain("review-performance");
		expect(existsSync(staleDir)).toBe(true);
		const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8"));
		expect(manifest.skills["review-performance"]).toBeUndefined();
		expect(manifest.skills["review-data-flow"]).toMatch(/^[a-f0-9]{64}$/);
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
			expect(manifest.skills.plan).not.toEqual(manifest.skills["review-architecture"]);
			expect(manifest.skills.plan).not.toHaveProperty("SKILL.md");
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
		expect(harness.sentMessages.map((m) => m.customType)).toEqual([OPENSPEC_CLI_OUTPUT_MESSAGE, OPENSPEC_CLI_OUTPUT_MESSAGE]);
	});

	it("runs openspec init --tools pi, then configures schema and seeds assets", async () => {
		const harness = createHarness({
			execStubs: {
				"openspec init --tools pi": { code: 0, stdout: "initialized", stderr: "" },
			},
		});
		registerOpenSpecCommands(harness.pi);

		await harness.commands.get("openspec:init")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });

		expect(readFileSync(join(cwd, "openspec", "config.yaml"), "utf-8")).toContain("schema: review-gated");
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "agents"))).toBe(true);
		expect(harness.notifications.at(-1)?.message).toContain("OpenSpec initialized for Pi review-gated workflow");
		expect(harness.execCalls.some((call) => call.cmd === "pi" && call.args.join(" ") === "install npm:pi-mcp-adapter")).toBe(false);
		expect(harness.execCalls.some((call) => call.args.join(" ").includes("@juicesharp"))).toBe(false);
		expect(existsSync(join(cwd, ".pi", "agent", "mcp.json"))).toBe(true);
		expect(harness.notifications.at(-1)?.message).toContain("codebase-memory MCP configured");
		expect(harness.notifications.at(-1)?.level).toBe("info");
	});

	it("preserves an existing codebase-memory MCP server during init", async () => {
		mkdirSync(join(cwd, ".pi", "agent"), { recursive: true });
		const mcpPath = join(cwd, ".pi", "agent", "mcp.json");
		const existing = { mcpServers: { custom: { command: "/opt/bin/codebase-memory-mcp", args: ["--custom"], directTools: false } } };
		writeFileSync(mcpPath, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
		const harness = createHarness({
			execStubs: {
				"openspec init --tools pi": { code: 0, stdout: "initialized", stderr: "" },
			},
		});
		registerOpenSpecCommands(harness.pi);

		await harness.commands.get("openspec:init")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });

		expect(JSON.parse(readFileSync(mcpPath, "utf-8"))).toEqual(existing);
		expect(harness.notifications.at(-1)?.message).toContain("Existing codebase-memory MCP configuration preserved");
	});

	it("fails early when openspec init fails", async () => {
		const harness = createHarness({
			execStubs: {
				"openspec init --tools pi": { code: 1, stdout: "", stderr: "boom" },
			},
		});
		registerOpenSpecCommands(harness.pi);

		await harness.commands.get("openspec:init")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });

		expect(harness.notifications.at(-1)?.message).toContain("openspec init --tools pi failed: boom");
		expect(harness.notifications.at(-1)?.level).toBe("error");
		expect(harness.execCalls.some((call) => call.cmd === "pi")).toBe(false);
	});

	it("runs openspec update, then refreshes schema, skills, agents, and manifests", async () => {
		const harness = createHarness({
			execStubs: {
				"openspec update": { code: 0, stdout: "updated", stderr: "" },
			},
		});
		registerUpdateAgentsCommand(harness.pi);

		await harness.commands.get("openspec:update")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });

		expect(harness.execCalls.some((call) => call.cmd === "openspec" && call.args.join(" ") === "update")).toBe(true);
		expect(readFileSync(join(cwd, "openspec", "config.yaml"), "utf-8")).toContain("schema: review-gated");
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "agents"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "mimir-managed.json"))).toBe(true);
		expect(harness.execCalls.some((call) => call.cmd === "openspec" && call.args.join(" ") === "update --tools pi")).toBe(false);
		expect(harness.notifications.at(-1)?.message).toContain("OpenSpec Pi workflow updated");
		expect(harness.notifications.at(-1)?.message).toContain("Updated skills:");
	});

	it("fails early when openspec update fails", async () => {
		const harness = createHarness({
			execStubs: {
				"openspec update": { code: 1, stdout: "", stderr: "boom" },
			},
		});
		registerUpdateAgentsCommand(harness.pi);

		await harness.commands.get("openspec:update")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });

		expect(harness.notifications.at(-1)?.message).toContain("openspec update failed: boom");
		expect(harness.notifications.at(-1)?.level).toBe("error");
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(false);
	});
});
