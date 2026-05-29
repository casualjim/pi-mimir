import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
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

describe("agents", () => {
	let targetDir: string;
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `openspec-agents-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		targetDir = join(cwd, ".pi", "agents");
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	describe("syncBundledAgents", () => {
		it("does not copy bundled agents or write a manifest", () => {
			const result = syncBundledAgents(cwd);
			expect(result).toEqual({ added: [], updated: [], unchanged: [], removed: [], errors: [] });
			expect(existsSync(targetDir)).toBe(false);
			expect(existsSync(join(cwd, ".pi", "mimir-managed.json"))).toBe(false);
		});

		it("prunes unchanged legacy managed agents", () => {
			const content = "# legacy agent\n";
			mkdirSync(targetDir, { recursive: true });
			writeFileSync(join(targetDir, "planner.md"), content, "utf-8");
			writeFileSync(join(cwd, ".pi", "mimir-managed.json"), JSON.stringify({ agents: { "planner.md": fileHash(content) } }), "utf-8");

			const result = syncBundledAgents(cwd);

			expect(result.removed).toContain("planner.md");
			expect(existsSync(join(targetDir, "planner.md"))).toBe(false);
			const manifest = existsSync(join(cwd, ".pi", "mimir-managed.json")) ? JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8")) : {};
			expect(manifest.agents).toBeUndefined();
		});

		it("preserves user-modified legacy managed agents", () => {
			mkdirSync(targetDir, { recursive: true });
			writeFileSync(join(targetDir, "planner.md"), "# user modified\n", "utf-8");
			writeFileSync(join(cwd, ".pi", "mimir-managed.json"), JSON.stringify({ agents: { "planner.md": fileHash("# legacy agent\n") } }), "utf-8");

			const result = syncBundledAgents(cwd);

			expect(result.removed).not.toContain("planner.md");
			expect(readFileSync(join(targetDir, "planner.md"), "utf-8")).toContain("user modified");
		});

		it("reads old .pi/agents/.openspec-managed.json and removes it", () => {
			const content = "# legacy agent\n";
			mkdirSync(targetDir, { recursive: true });
			writeFileSync(join(targetDir, "reviewer.md"), content, "utf-8");
			writeFileSync(join(targetDir, ".openspec-managed.json"), JSON.stringify({ "reviewer.md": fileHash(content) }), "utf-8");

			const result = syncBundledAgents(cwd);

			expect(result.removed).toContain("reviewer.md");
			expect(existsSync(join(targetDir, ".openspec-managed.json"))).toBe(false);
		});
	});

	describe("PACKAGE_ROOT resolution", () => {
		it("resolves to packages/pi-mimir/", () => {
			expect(PACKAGE_ROOT).toContain("packages/pi-mimir");
			expect(PACKAGE_ROOT).not.toContain("extensions/openspec");
		});

		it("BUNDLED_AGENTS_DIR is under PACKAGE_ROOT", () => {
			expect(BUNDLED_AGENTS_DIR).toBe(join(PACKAGE_ROOT, "agents"));
		});
	});
});
