import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

	it("collects only OpenSpec schema and config asset kinds", () => {
		const kinds = new Set(Object.values(collectOpenSpecAssetEntries()).map((e) => e.sourceAssetKind));
		expect(kinds).toContain("schema");
		expect(kinds).toContain("config");
		expect(kinds).not.toContain("agent");
		expect(kinds).not.toContain("skill");
		expect(kinds).not.toContain("prompt");
	});

	it("writes OpenSpec version and hash metadata without package synthetic version", () => {
		writeOpenSpecAssetManifest(cwd);
		const raw = JSON.parse(readFileSync(join(cwd, ".openspec-assets-managed.json"), "utf-8"));
		const first = Object.values(raw)[0] as any;
		expect(first).not.toHaveProperty("packageVersion");
		expect(first).toHaveProperty("openspecVersion");
		expect(first).toHaveProperty("sourceAssetVersion");
		expect(first).toHaveProperty("targetPath");
		expect(first).toHaveProperty("contentHash");
	});

	it("reports stale OpenSpec manifest entries by version marker", () => {
		writeOpenSpecAssetManifest(cwd);
		const manifestPath = join(cwd, ".openspec-assets-managed.json");
		const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
		const firstKey = Object.keys(raw)[0]!;
		raw[firstKey].openspecVersion = "0.0.0";
		writeFileSync(manifestPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
		expect(findStaleOpenSpecAssets(cwd)).toContain(firstKey);
	});
});
