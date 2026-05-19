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
		expect(existsSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"))).toBe(true);
		expect(existsSync(join(cwd, ".pi", "skills", "implement", "SKILL.md"))).toBe(true);
	});
});

describe("/openspec:* commands", () => {
	let cwd: string;
	let oldXdg: string | undefined;

	beforeEach(() => {
		cwd = join(tmpdir(), `openspec-command-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		mkdirSync(cwd, { recursive: true });
		oldXdg = process.env.XDG_DATA_HOME;
		process.env.XDG_DATA_HOME = join(cwd, ".xdg");
	});

	afterEach(() => {
		if (oldXdg === undefined) delete process.env.XDG_DATA_HOME;
		else process.env.XDG_DATA_HOME = oldXdg;
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

		await harness.commands.get("openspec:status")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });
		await harness.commands.get("openspec:list")!.handler("", { hasUI: true, ui: harness.ctx.ui, cwd });

		expect(harness.notifications.map((n) => n.message)).toEqual(["dashboard", "changes"]);
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
	});
});
