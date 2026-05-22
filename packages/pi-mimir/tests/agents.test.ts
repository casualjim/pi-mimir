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

	describe("syncBundledAgents (read-only mode)", () => {
		it("syncs bundled agents without errors", () => {
			const result = syncBundledAgents(cwd, false);
			expect(result.errors).toEqual([]);
			expect(result.added.length + result.unchanged.length + result.updated.length).toBeGreaterThan(0);
		});

		it("creates .pi/agents/ directory if it doesn't exist", () => {
			syncBundledAgents(cwd, false);
			expect(existsSync(targetDir)).toBe(true);
		});

		it("creates manifest on first sync", () => {
			syncBundledAgents(cwd, false);
			expect(existsSync(join(targetDir, ".openspec-managed.json"))).toBe(true);
		});

	});

	describe("syncBundledAgents with mock source", () => {
		// We can't easily mock BUNDLED_AGENTS_DIR since it's a module-level constant.
		// Instead, we test the sync logic by creating files in the actual bundled dir
		// OR we test with the actual dir (which is currently empty).
		// For comprehensive testing, we verify the manifest and path-traversal logic.

		it("agent manifest remains content-addressable hash map with sorted keys", () => {
			syncBundledAgents(cwd, false);
			const manifestPath = join(targetDir, ".openspec-managed.json");
			const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
			const keys = Object.keys(raw);
			expect(keys).toEqual([...keys].sort());
			const first = raw[keys[0]!];
			expect(typeof first).toBe("string");
			expect(first).toMatch(/^[a-f0-9]{64}$/);
		});

		it("handles re-sync gracefully", () => {
			syncBundledAgents(cwd, false);
			const result2 = syncBundledAgents(cwd, false);
			// Second sync should not error
			expect(result2.errors).toEqual([]);
		});
	});

	describe("apply mode", () => {
		it("apply mode sync produces valid results", () => {
			const result = syncBundledAgents(cwd, true);
			expect(result.errors).toEqual([]);
		});

		it("apply mode creates target directory", () => {
			syncBundledAgents(cwd, true);
			expect(existsSync(targetDir)).toBe(true);
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

	describe("user-modified agent drift (read-only mode)", () => {
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

		it("detects user-modified file as pendingUpdate in read-only mode", () => {
			// 1. First sync: copies the agent
			const r1 = syncBundledAgents(cwd, false);
			expect(r1.added).toContain(testAgentName);
			expect(r1.errors).toEqual([]);

			// 2. Simulate user editing the destination file
			const destPath = join(targetDir, testAgentName);
			writeFileSync(destPath, "# Test Agent\nUSER MODIFIED CONTENT!\n", "utf-8");

			// 3. Re-sync in read-only mode
			const r2 = syncBundledAgents(cwd, false);
			expect(r2.pendingUpdate).toContain(testAgentName);
			expect(r2.updated).not.toContain(testAgentName); // must NOT overwrite this user-modified file

			// 4. Verify user content is preserved
			const preserved = readFileSync(destPath, "utf-8");
			expect(preserved).toContain("USER MODIFIED CONTENT!");
		});

		it("allows apply mode to overwrite user-modified file", () => {
			// 1. First sync
			syncBundledAgents(cwd, false);

			// 2. User modifies
			const destPath = join(targetDir, testAgentName);
			writeFileSync(destPath, "# Test Agent\nUSER MODIFIED!\n", "utf-8");

			// 3. Apply-mode sync overwrites
			const r3 = syncBundledAgents(cwd, true);
			expect(r3.updated).toContain(testAgentName);

			// 4. Content is now the bundled version
			const restored = readFileSync(destPath, "utf-8");
			expect(restored).toBe(testAgentContent);
		});

		it("auto-removes unmodified stale file even in read-only mode", () => {
			// 1. Sync creates the agent
			syncBundledAgents(cwd, false);

			// 2. Remove source file (simulates agent removed from bundle)
			rmSync(srcPath, { force: true });

			// 3. Re-sync in read-only mode — unmodified stale files are auto-removed
			//    (safeAutoRemove: knownHash !== "" && destHash === knownHash)
			const r4 = syncBundledAgents(cwd, false);
			expect(r4.removed).toContain(testAgentName);
			expect(r4.pendingRemove).toEqual([]);

			// 4. File is gone from disk
			const destPath = join(targetDir, testAgentName);
			expect(existsSync(destPath)).toBe(false);
		});

		it("detects user-modified stale file as pendingRemove in read-only mode", () => {
			// 1. Sync creates the agent
			syncBundledAgents(cwd, false);

			// 2. User modifies the destination
			const destPath = join(targetDir, testAgentName);
			writeFileSync(destPath, "# Modified by user\n", "utf-8");

			// 3. Remove source file (simulates agent removed from bundle)
			rmSync(srcPath, { force: true });

			// 4. Re-sync in read-only mode — user-modified stale file is NOT auto-removed
			const r5 = syncBundledAgents(cwd, false);
			expect(r5.pendingRemove).toContain(testAgentName);
			expect(r5.removed).not.toContain(testAgentName); // must NOT delete user-modified file

			// 5. File still exists on disk
			expect(existsSync(destPath)).toBe(true);
		});

		it("removes stale managed file in apply mode", () => {
			// 1. Sync creates the agent
			syncBundledAgents(cwd, false);

			// 2. Remove source file
			rmSync(srcPath, { force: true });

			// 3. Apply-mode sync removes stale file
			const r5 = syncBundledAgents(cwd, true);
			expect(r5.removed).toContain(testAgentName);

			// 4. File gone from disk
			const destPath = join(targetDir, testAgentName);
			expect(existsSync(destPath)).toBe(false);
		});

		it("auto-heals unchanged managed file even in read-only mode", () => {
			// 1. First sync
			syncBundledAgents(cwd, false);

			// 2. Update the source content (new version)
			const newContent = "# Test Agent\nUpdated v2 content.\n";
			writeFileSync(srcPath, newContent, "utf-8");

			// 3. Destination still matches manifest (not user-modified)
			const r2 = syncBundledAgents(cwd, false);
			// safeAutoUpdate: knownHash !== "" && destHash === knownHash → auto-update
			expect(r2.updated).toContain(testAgentName);
			expect(r2.pendingUpdate).toEqual([]);

			// 4. Verify content was updated
			const destPath = join(targetDir, testAgentName);
			const content = readFileSync(destPath, "utf-8");
			expect(content).toBe(newContent);
		});
	});
});
