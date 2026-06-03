import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncBundledAgents, BUNDLED_AGENTS_DIR, PACKAGE_ROOT } from "../extensions/openspec/agents.js";

function sha256(parts: Array<Buffer | string>): string {
	const hash = createHash("sha256");
	for (const part of parts) hash.update(part);
	return hash.digest("hex");
}

function fileHash(content: string): string {
	return sha256([Buffer.from(content)]);
}

function bundledAgentNames(): string[] {
	return readdirSync(BUNDLED_AGENTS_DIR)
		.filter((name) => name.endsWith(".md"))
		.sort();
}

describe("agents", () => {
	let projectAgentDir: string;
	let userRoot: string;
	let userAgentDir: string;
	let cwd: string;
	let previousAgentDir: string | undefined;

	beforeEach(() => {
		cwd = join(tmpdir(), `openspec-agents-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		projectAgentDir = join(cwd, ".pi", "agents");
		userRoot = join(cwd, "user-agent");
		userAgentDir = join(userRoot, "agents");
		previousAgentDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = userRoot;
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		rmSync(cwd, { recursive: true, force: true });
	});

	describe("syncBundledAgents", () => {
		it("syncs bundled agents to the user agent directory and writes a manifest", () => {
			const result = syncBundledAgents(cwd);
			const expected = bundledAgentNames();

			expect(result.added.sort()).toEqual(expected);
			expect(result.updated).toEqual([]);
			expect(result.removed).toEqual([]);
			expect(result.errors).toEqual([]);
			expect(existsSync(projectAgentDir)).toBe(false);
			for (const name of expected) expect(existsSync(join(userAgentDir, name))).toBe(true);

			const manifest = JSON.parse(readFileSync(join(userRoot, "mimir-managed.json"), "utf-8"));
			expect(Object.keys(manifest.agents).sort()).toEqual(expected);
			for (const name of expected) {
				expect(manifest.agents[name]).toBe(fileHash(readFileSync(join(BUNDLED_AGENTS_DIR, name), "utf-8")));
			}
		});

		it("prunes unchanged legacy project managed agents", () => {
			const content = "# legacy agent\n";
			mkdirSync(projectAgentDir, { recursive: true });
			writeFileSync(join(projectAgentDir, "planner.md"), content, "utf-8");
			writeFileSync(join(cwd, ".pi", "mimir-managed.json"), JSON.stringify({ agents: { "planner.md": fileHash(content) } }), "utf-8");

			const result = syncBundledAgents(cwd);

			expect(result.removed).toContain("planner.md");
			expect(existsSync(join(projectAgentDir, "planner.md"))).toBe(false);
			const manifest = existsSync(join(cwd, ".pi", "mimir-managed.json")) ? JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8")) : {};
			expect(manifest.agents).toBeUndefined();
		});

		it("preserves user-modified legacy project managed agents", () => {
			mkdirSync(projectAgentDir, { recursive: true });
			writeFileSync(join(projectAgentDir, "planner.md"), "# user modified\n", "utf-8");
			writeFileSync(join(cwd, ".pi", "mimir-managed.json"), JSON.stringify({ agents: { "planner.md": fileHash("# legacy agent\n") } }), "utf-8");

			const result = syncBundledAgents(cwd);

			expect(result.removed).not.toContain("planner.md");
			expect(readFileSync(join(projectAgentDir, "planner.md"), "utf-8")).toContain("user modified");
		});

		it("reads old .pi/agents/.openspec-managed.json and removes it", () => {
			const content = "# legacy agent\n";
			mkdirSync(projectAgentDir, { recursive: true });
			writeFileSync(join(projectAgentDir, "reviewer.md"), content, "utf-8");
			writeFileSync(join(projectAgentDir, ".openspec-managed.json"), JSON.stringify({ "reviewer.md": fileHash(content) }), "utf-8");

			const result = syncBundledAgents(cwd);

			expect(result.removed).toContain("reviewer.md");
			expect(existsSync(join(projectAgentDir, ".openspec-managed.json"))).toBe(false);
		});

		it("preserves user-modified managed user agents and drops them from the manifest", () => {
			mkdirSync(userAgentDir, { recursive: true });
			writeFileSync(join(userAgentDir, "reviewer.md"), "# user modified\n", "utf-8");
			writeFileSync(join(userRoot, "mimir-managed.json"), JSON.stringify({ agents: { "reviewer.md": fileHash("# previous managed\n") } }), "utf-8");

			const result = syncBundledAgents(cwd);
			const manifest = JSON.parse(readFileSync(join(userRoot, "mimir-managed.json"), "utf-8"));

			expect(result.updated).not.toContain("reviewer.md");
			expect(readFileSync(join(userAgentDir, "reviewer.md"), "utf-8")).toContain("user modified");
			expect(manifest.agents["reviewer.md"]).toBeUndefined();
		});

		it("removes managed user agents that are no longer bundled", () => {
			const content = "# old managed\n";
			mkdirSync(userAgentDir, { recursive: true });
			writeFileSync(join(userAgentDir, "old.md"), content, "utf-8");
			writeFileSync(join(userRoot, "mimir-managed.json"), JSON.stringify({ agents: { "old.md": fileHash(content) } }), "utf-8");

			const result = syncBundledAgents(cwd);

			expect(result.removed).toContain("old.md");
			expect(existsSync(join(userAgentDir, "old.md"))).toBe(false);
		});
	});

	describe("PACKAGE_ROOT resolution", () => {
		it("resolves to packages/pi-openspec/", () => {
			expect(PACKAGE_ROOT).toContain("packages/pi-openspec");
			expect(PACKAGE_ROOT).not.toContain("extensions/openspec");
		});

		it("BUNDLED_AGENTS_DIR is under PACKAGE_ROOT", () => {
			expect(BUNDLED_AGENTS_DIR).toBe(join(PACKAGE_ROOT, "agents"));
		});
	});
});
