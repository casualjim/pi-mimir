import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BUNDLED_AGENTS_DIR, PACKAGE_ROOT, syncBundledAgents } from "../extensions/advisor/agents.js";

describe("advisor bundled agents", () => {
	let cwd: string;
	let targetDir: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `advisor-agents-test-${Date.now()}`);
		targetDir = join(cwd, ".pi", "agents");
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("syncs bundled agents and writes a manifest", () => {
		const result = syncBundledAgents(cwd);
		expect(result.errors).toEqual([]);
		expect(existsSync(join(cwd, ".pi", "advisor-managed.json"))).toBe(true);
		expect(existsSync(join(targetDir, "advisor-child.md"))).toBe(true);
	});

	it("tracks hashes in sorted order", () => {
		syncBundledAgents(cwd);
		const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "advisor-managed.json"), "utf-8"));
		const keys = Object.keys(manifest.agents);
		expect(keys).toEqual([...keys].sort());
		expect(manifest.agents["advisor-child.md"]).toMatch(/^[a-f0-9]{64}$/);
	});

	it("does not overwrite user-modified files", () => {
		syncBundledAgents(cwd);
		const destPath = join(targetDir, "advisor-child.md");
		writeFileSync(destPath, "# user modified\n", "utf-8");
		const result = syncBundledAgents(cwd);
		expect(result.updated).not.toContain("advisor-child.md");
		const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "advisor-managed.json"), "utf-8"));
		expect(manifest.agents["advisor-child.md"]).toBeUndefined();
	});

	it("resolves package root correctly", () => {
		expect(PACKAGE_ROOT).toContain("packages/advisor");
		expect(BUNDLED_AGENTS_DIR).toBe(join(PACKAGE_ROOT, "agents"));
	});
});
