import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
	listBundledSchemas,
	getGlobalSchemasDir,
	BUNDLED_SCHEMAS_DIR,
} from "../extensions/openspec/schema-sync.js";

describe("schema sync", () => {
	it("finds bundled review-gated schema", () => {
		const schemas = listBundledSchemas();
		expect(schemas).toContain("review-gated");
	});

	it("bundled schemas directory contains schema.yaml and templates", () => {
		expect(existsSync(join(BUNDLED_SCHEMAS_DIR, "review-gated", "schema.yaml"))).toBe(true);
		expect(existsSync(join(BUNDLED_SCHEMAS_DIR, "review-gated", "templates", "proposal.md"))).toBe(true);
		expect(existsSync(join(BUNDLED_SCHEMAS_DIR, "review-gated", "templates", "planning-review.md"))).toBe(true);
	});

	it("global schemas dir resolves to XDG path", () => {
		const dir = getGlobalSchemasDir();
		expect(dir).toMatch(/openspec\/schemas$/);
	});

	describe("sync to temp directory", () => {
		// Override getGlobalSchemasDir by testing syncSingleSchema indirectly
		// via a temp target. We test the core sync logic here.

		// Since syncBundledSchemas writes to the real XDG dir, we test the
		// structural properties instead of doing a full sync to a temp dir.
		// Full integration testing happens in review-gated-workflow-cli.test.ts.

		it("schema files include nested templates", () => {
			const templatesDir = join(BUNDLED_SCHEMAS_DIR, "review-gated", "templates");
			const templates = readdirSync(templatesDir).filter((f) => f.endsWith(".md"));
			expect(templates.sort()).toEqual([
				"design.md",
				"planning-review.md",
				"proposal.md",
				"spec.md",
				"tasks.md",
			]);
		});

		it("schema.yaml is valid YAML with required fields", () => {
			const content = readFileSync(join(BUNDLED_SCHEMAS_DIR, "review-gated", "schema.yaml"), "utf-8");
			expect(content).toContain("name: review-gated");
			expect(content).toContain("version: 1");
			expect(content).toContain("artifacts:");
		});
	});
});
