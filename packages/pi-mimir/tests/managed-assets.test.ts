import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectOpenSpecAssetEntries, findStaleOpenSpecAssets, writeOpenSpecAssetManifest } from "../extensions/openspec/managed-assets.js";

describe("OpenSpec managed assets", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `openspec-assets-test-${Date.now()}`);
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("collects only OpenSpec schema and config asset hashes", () => {
		const entries = collectOpenSpecAssetEntries();
		const keys = Object.keys(entries);
		expect(keys.some((k) => k.startsWith("openspec/schemas/"))).toBe(true);
		expect(keys.some((k) => k.startsWith("openspec/config/"))).toBe(true);
		expect(keys.some((k) => k.startsWith("agents/"))).toBe(false);
		expect(keys.some((k) => k.startsWith("skillseeds/"))).toBe(false);
		expect(Object.values(entries).every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
	});

	it("writes canonical manifest sections as hash mappings", () => {
		writeOpenSpecAssetManifest(cwd);
		const raw = JSON.parse(readFileSync(join(cwd, ".pi", "mimir-managed.json"), "utf-8"));
		const first = Object.values(raw.openSpecAssets)[0] as any;
		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(first).not.toHaveProperty("contentHash");
		expect(raw.openSpecAssets).not.toHaveProperty("lastGeneratedAt");
	});

	it("reports stale OpenSpec manifest entries by hash", () => {
		writeOpenSpecAssetManifest(cwd);
		const manifestPath = join(cwd, ".pi", "mimir-managed.json");
		const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
		const firstKey = Object.keys(raw.openSpecAssets)[0]!;
		raw.openSpecAssets[firstKey] = "0".repeat(64);
		writeFileSync(manifestPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
		expect(findStaleOpenSpecAssets(cwd)).toContain(firstKey);
	});

	it("removes legacy root asset manifest when canonical manifest is written", () => {
		const legacyPath = join(cwd, ".openspec-assets-managed.json");
		writeFileSync(legacyPath, "{}\n", "utf-8");
		writeOpenSpecAssetManifest(cwd);
		expect(existsSync(legacyPath)).toBe(false);
		expect(existsSync(join(cwd, ".pi", "mimir-managed.json"))).toBe(true);
	});
});
