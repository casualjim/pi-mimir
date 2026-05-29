import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BUNDLED_AGENTS_DIR, PACKAGE_ROOT, syncBundledAgents } from "../extensions/advisor/agents.js";

function fileHash(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

describe("advisor bundled agents", () => {
	let cwd: string;
	let targetDir: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `advisor-agents-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		targetDir = join(cwd, ".pi", "agents");
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("does not copy bundled agents or write a manifest", () => {
		const result = syncBundledAgents(cwd);
		expect(result).toEqual({ added: [], updated: [], unchanged: [], removed: [], errors: [] });
		expect(existsSync(join(cwd, ".pi", "advisor-managed.json"))).toBe(false);
		expect(existsSync(join(targetDir, "advisor-child.md"))).toBe(false);
	});

	it("prunes unchanged legacy copied agents and removes the legacy manifest", () => {
		const content = "# legacy advisor\n";
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, "advisor-child.md"), content, "utf-8");
		writeFileSync(join(cwd, ".pi", "advisor-managed.json"), JSON.stringify({ agents: { "advisor-child.md": fileHash(content) } }), "utf-8");

		const result = syncBundledAgents(cwd);

		expect(result.removed).toContain("advisor-child.md");
		expect(existsSync(join(targetDir, "advisor-child.md"))).toBe(false);
		expect(existsSync(join(cwd, ".pi", "advisor-managed.json"))).toBe(false);
	});

	it("preserves user-modified legacy copied agents", () => {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, "advisor-child.md"), "# user modified\n", "utf-8");
		writeFileSync(join(cwd, ".pi", "advisor-managed.json"), JSON.stringify({ agents: { "advisor-child.md": fileHash("# legacy advisor\n") } }), "utf-8");

		const result = syncBundledAgents(cwd);

		expect(result.removed).not.toContain("advisor-child.md");
		expect(readFileSync(join(targetDir, "advisor-child.md"), "utf-8")).toContain("user modified");
		expect(existsSync(join(cwd, ".pi", "advisor-managed.json"))).toBe(false);
	});

	it("resolves package root correctly", () => {
		expect(PACKAGE_ROOT).toContain("packages/advisor");
		expect(BUNDLED_AGENTS_DIR).toBe(join(PACKAGE_ROOT, "agents"));
	});
});
