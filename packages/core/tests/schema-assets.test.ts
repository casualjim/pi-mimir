import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SCHEMA_PATH = "openspec/schemas/review-gated/schema.yaml";
const TEMPLATE_DIR = "openspec/schemas/review-gated/templates";

const REVIEW_ARTIFACTS = [
	["review-proposal", "reviews/proposal.md", "review-proposal.md"],
	["review-specs", "reviews/specs.md", "review-specs.md"],
	["review-design", "reviews/design.md", "review-design.md"],
	["review-tasks", "reviews/tasks.md", "review-tasks.md"],
	["review-claims", "reviews/claims.md", "review-claims.md"],
	["review-architecture", "reviews/architecture.md", "review-architecture.md"],
	["review-tests", "reviews/tests.md", "review-tests.md"],
	["review-performance", "reviews/performance.md", "review-performance.md"],
	["review-security", "reviews/security.md", "review-security.md"],
] as const;

describe("review-gated schema assets", () => {
	it("passes OpenSpec schema validation", () => {
		const result = spawnSync("openspec", ["schema", "validate", "review-gated", "--no-color"], {
			cwd: process.cwd(),
			encoding: "utf8",
			timeout: 60_000,
		});
		expect(`${result.stdout}\n${result.stderr}`).toContain("Schema 'review-gated' is valid");
		expect(result.status).toBe(0);
	});

	it("references every file in the schema template directory", () => {
		const schema = readFileSync(SCHEMA_PATH, "utf-8");
		const templates = readdirSync(TEMPLATE_DIR).filter((name) => name.endsWith(".md"));
		for (const template of templates) {
			expect(schema, `${template} must be referenced by schema.yaml`).toContain(`template: ${template}`);
		}
	});

	it("models each review gate as its own schema-owned artifact", () => {
		const schema = readFileSync(SCHEMA_PATH, "utf-8");
		for (const [id, output, template] of REVIEW_ARTIFACTS) {
			expect(schema).toContain(`id: ${id}`);
			expect(schema).toContain(`generates: ${output}`);
			expect(schema).toContain(`template: ${template}`);
		}
		expect(schema).not.toContain("id: review-plan");
		expect(schema).not.toContain("id: review-implementation");
		expect(schema).not.toContain("id: archive-readiness");
		expect(schema).not.toContain("generates: archive.md");
	});

	it("review output templates provide concrete tables instead of orchestrator placeholders", () => {
		for (const [, , file] of REVIEW_ARTIFACTS) {
			const text = readFileSync(join(TEMPLATE_DIR, file), "utf-8");
			expect(text).not.toContain("<severity>");
			expect(text).not.toContain("<recommended fix>");
			if (file === "review-claims.md") {
				expect(text).toContain("| Claim | Verdict | Evidence | Reasoning | Next action |");
			} else {
				expect(text).toContain("| Severity | Location | Evidence | Problem | Impact | Recommended fix | Status |");
			}
		}
	});
});
