import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncBundledAgents, BUNDLED_AGENTS_DIR, PACKAGE_ROOT } from "../extensions/openspec/agents.js";

describe("agents", () => {
	let targetDir: string;
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `openspec-agents-test-${Date.now()}`);
		targetDir = join(cwd, ".pi", "agents");
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	describe("syncBundledAgents", () => {
		it("syncs bundled agents without errors", () => {
			const result = syncBundledAgents(cwd);
			expect(result.errors).toEqual([]);
			expect(result.added.length + result.unchanged.length + result.updated.length).toBeGreaterThan(0);
		});

		it("creates .pi/agents/ directory if it doesn't exist", () => {
			syncBundledAgents(cwd);
			expect(existsSync(targetDir)).toBe(true);
		});

		it("creates canonical manifest on first sync", () => {
			syncBundledAgents(cwd);
			expect(existsSync(join(cwd, ".pi", "mimir-managed.json"))).toBe(true);
			expect(existsSync(join(targetDir, ".openspec-managed.json"))).toBe(false);
		});

	});

	describe("syncBundledAgents with mock source", () => {
		// We can't easily mock BUNDLED_AGENTS_DIR since it's a module-level constant.
		// Instead, we test the sync logic by creating files in the actual bundled dir
		// OR we test with the actual dir (which is currently empty).
		// For comprehensive testing, we verify the manifest and path-traversal logic.

		it("agent manifest remains content-addressable hash map with sorted keys", () => {
			syncBundledAgents(cwd);
			const manifestPath = join(cwd, ".pi", "mimir-managed.json");
			const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
			const keys = Object.keys(raw.agents);
			expect(keys).toEqual([...keys].sort());
			const first = raw.agents[keys[0]!];
			expect(typeof first).toBe("string");
			expect(first).toMatch(/^[a-f0-9]{64}$/);
		});

		it("handles re-sync gracefully", () => {
			syncBundledAgents(cwd);
			const result2 = syncBundledAgents(cwd);
			// Second sync should not error
			expect(result2.errors).toEqual([]);
		});

		it("does not sync the removed explore agent", () => {
			syncBundledAgents(cwd);
			expect(existsSync(join(targetDir, "explore.md"))).toBe(false);
			const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8"));
			expect(manifest.agents).not.toHaveProperty("explore.md");
		});

		it("removes legacy agent manifest when canonical manifest is written", () => {
			mkdirSync(targetDir, { recursive: true });
			writeFileSync(join(targetDir, ".openspec-managed.json"), "{}\n", "utf-8");
			syncBundledAgents(cwd);
			expect(existsSync(join(targetDir, ".openspec-managed.json"))).toBe(false);
			expect(existsSync(join(cwd, ".pi", "mimir-managed.json"))).toBe(true);
		});
	});

	describe("PACKAGE_ROOT resolution", () => {
		it("resolves to packages/pi-mimir/", () => {
			// PACKAGE_ROOT should end with packages/pi-mimir
			expect(PACKAGE_ROOT).toContain("packages/pi-mimir");
			expect(PACKAGE_ROOT).not.toContain("extensions/openspec");
		});

		it("BUNDLED_AGENTS_DIR is under PACKAGE_ROOT", () => {
			expect(BUNDLED_AGENTS_DIR).toBe(join(PACKAGE_ROOT, "agents"));
		});
	});

	describe("user-modified agent ownership", () => {
		const testAgentName = "_test-drift-agent.md";
		const testAgentContent = "# Test Agent\nOriginal content.\n";
		const srcPath = join(BUNDLED_AGENTS_DIR, testAgentName);

		beforeEach(() => {
			mkdirSync(BUNDLED_AGENTS_DIR, { recursive: true });
			writeFileSync(srcPath, testAgentContent, "utf-8");
		});

		afterEach(() => {
			// Clean up test agent from bundled dir
			if (existsSync(srcPath)) rmSync(srcPath, { force: true });
		});

		it("leaves user-modified managed files on disk and stops tracking them", () => {
			// 1. First sync: copies the agent
			const r1 = syncBundledAgents(cwd);
			expect(r1.added).toContain(testAgentName);
			expect(r1.errors).toEqual([]);

			// 2. Simulate user editing the destination file
			const destPath = join(targetDir, testAgentName);
			writeFileSync(destPath, "# Test Agent\nUSER MODIFIED CONTENT!\n", "utf-8");

			// 3. Re-sync
			const r2 = syncBundledAgents(cwd);
			expect(r2.updated).not.toContain(testAgentName); // must NOT overwrite this user-modified file

			// 4. Verify user content is preserved and no longer managed
			const preserved = readFileSync(destPath, "utf-8");
			expect(preserved).toContain("USER MODIFIED CONTENT!");
			const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8"));
			expect(manifest.agents[testAgentName]).toBeUndefined();
		});

		it("does not overwrite user-modified files", () => {
			// 1. First sync
			syncBundledAgents(cwd);

			// 2. User modifies
			const destPath = join(targetDir, testAgentName);
			writeFileSync(destPath, "# Test Agent\nUSER MODIFIED!\n", "utf-8");

			// 3. Sync still preserves user-owned content
			const r3 = syncBundledAgents(cwd);
			expect(r3.updated).not.toContain(testAgentName);

			// 4. Content is still the user version and no longer managed
			const restored = readFileSync(destPath, "utf-8");
			expect(restored).toContain("USER MODIFIED!");
			const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8"));
			expect(manifest.agents[testAgentName]).toBeUndefined();
		});

		it("auto-removes unmodified stale file", () => {
			// 1. Sync creates the agent
			syncBundledAgents(cwd);

			// 2. Remove source file (simulates agent removed from bundle)
			rmSync(srcPath, { force: true });

			// 3. Re-sync — unmodified stale files are auto-removed
			//    (safeAutoRemove: knownHash !== "" && destHash === knownHash)
			const r4 = syncBundledAgents(cwd);
			expect(r4.removed).toContain(testAgentName);

			// 4. File is gone from disk
			const destPath = join(targetDir, testAgentName);
			expect(existsSync(destPath)).toBe(false);
		});

		it("leaves user-modified stale files on disk and stops tracking them", () => {
			// 1. Sync creates the agent
			syncBundledAgents(cwd);

			// 2. User modifies the destination
			const destPath = join(targetDir, testAgentName);
			writeFileSync(destPath, "# Modified by user\n", "utf-8");

			// 3. Remove source file (simulates agent removed from bundle)
			rmSync(srcPath, { force: true });

			// 4. Re-sync — user-modified stale file is NOT auto-removed
			const r5 = syncBundledAgents(cwd);
			expect(r5.removed).not.toContain(testAgentName); // must NOT delete user-modified file

			// 5. File still exists on disk and is no longer managed
			expect(existsSync(destPath)).toBe(true);
			const manifest = JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8"));
			expect(manifest.agents[testAgentName]).toBeUndefined();
		});

		it("removes stale managed file when unchanged", () => {
			// 1. Sync creates the agent
			syncBundledAgents(cwd);

			// 2. Remove source file
			rmSync(srcPath, { force: true });

			// 3. Sync removes stale file
			const r5 = syncBundledAgents(cwd);
			expect(r5.removed).toContain(testAgentName);

			// 4. File gone from disk
			const destPath = join(targetDir, testAgentName);
			expect(existsSync(destPath)).toBe(false);
		});

		it("auto-heals unchanged managed file", () => {
			// 1. First sync
			syncBundledAgents(cwd);

			// 2. Update the source content (new version)
			const newContent = "# Test Agent\nUpdated v2 content.\n";
			writeFileSync(srcPath, newContent, "utf-8");

			// 3. Destination still matches manifest (not user-modified)
			const r2 = syncBundledAgents(cwd);
			// safeAutoUpdate: knownHash !== "" && destHash === knownHash → auto-update
			expect(r2.updated).toContain(testAgentName);

			// 4. Verify content was updated
			const destPath = join(targetDir, testAgentName);
			const content = readFileSync(destPath, "utf-8");
			expect(content).toBe(newContent);
		});
	});
});
