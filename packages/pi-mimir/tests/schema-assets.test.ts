import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const SCHEMA_PATH = "openspec/schemas/review-gated/schema.yaml";
const TEMPLATE_DIR = "openspec/schemas/review-gated/templates";

interface ArtifactSchema {
	id: string;
	generates: string;
	description: string;
	template: string;
	instruction?: string;
	requires?: string[];
}

interface ReviewGatedSchema {
	name: string;
	version: number;
	description?: string;
	artifacts: ArtifactSchema[];
	apply?: {
		requires?: string[];
		tracks?: string | null;
		instruction?: string;
	};
}

const EXPECTED_ARTIFACTS = new Map<string, { generates: string; template: string; requires: string[] }>([
	["proposal", { generates: "proposal.md", template: "proposal.md", requires: [] }],
	["design", { generates: "design.md", template: "design.md", requires: ["proposal"] }],
	["specs", { generates: "specs/**/*.md", template: "spec.md", requires: ["proposal"] }],
	["tasks", { generates: "tasks.md", template: "tasks.md", requires: ["specs", "design"] }],
]);

function loadSchema(): ReviewGatedSchema {
	return parseYaml(readFileSync(SCHEMA_PATH, "utf-8")) as ReviewGatedSchema;
}

function artifactById(schema: ReviewGatedSchema): Map<string, ArtifactSchema> {
	return new Map(schema.artifacts.map((artifact) => [artifact.id, artifact]));
}

function requiresOf(artifact: ArtifactSchema): string[] {
	return artifact.requires ?? [];
}

function expectNoCycles(schema: ReviewGatedSchema): void {
	const artifacts = artifactById(schema);
	const visiting = new Set<string>();
	const visited = new Set<string>();

	function visit(id: string, path: string[]): void {
		if (visited.has(id)) return;
		if (visiting.has(id)) {
			throw new Error(`Cyclic dependency detected: ${[...path, id].join(" -> ")}`);
		}

		visiting.add(id);
		const artifact = artifacts.get(id);
		if (!artifact) throw new Error(`Unknown artifact: ${id}`);

		for (const dependency of requiresOf(artifact)) {
			visit(dependency, [...path, id]);
		}

		visiting.delete(id);
		visited.add(id);
	}

	for (const artifact of schema.artifacts) {
		visit(artifact.id, []);
	}
}

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

	it("parses with the expected review-gated artifact graph", () => {
		const schema = loadSchema();
		const artifacts = artifactById(schema);

		expect(schema.name).toBe("review-gated");
		expect(schema.version).toBe(1);
		expect(schema.artifacts.map((artifact) => artifact.id)).toEqual([...EXPECTED_ARTIFACTS.keys()]);

		for (const [id, expected] of EXPECTED_ARTIFACTS) {
			const artifact = artifacts.get(id);
			expect(artifact, `${id} must exist`).toBeDefined();
			expect(artifact?.generates).toBe(expected.generates);
			expect(artifact?.template).toBe(expected.template);
			expect(requiresOf(artifact!)).toEqual(expected.requires);
		}
	});

	it("has valid dependency references and no dependency cycles", () => {
		const schema = loadSchema();
		const ids = new Set<string>();

		for (const artifact of schema.artifacts) {
			expect(ids.has(artifact.id), `duplicate artifact id: ${artifact.id}`).toBe(false);
			ids.add(artifact.id);
		}

		for (const artifact of schema.artifacts) {
			for (const dependency of requiresOf(artifact)) {
				expect(ids.has(dependency), `${artifact.id} requires unknown artifact ${dependency}`).toBe(true);
			}
		}

		expect(() => expectNoCycles(schema)).not.toThrow();
	});

	it("references existing template files and no unused schema templates", () => {
		const schema = loadSchema();
		const referencedTemplates = new Set(schema.artifacts.map((artifact) => artifact.template));
		const templateFiles = readdirSync(TEMPLATE_DIR).filter((name) => name.endsWith(".md"));

		for (const artifact of schema.artifacts) {
			const templatePath = join(TEMPLATE_DIR, artifact.template);
			expect(existsSync(templatePath), `${artifact.id} template ${artifact.template} must exist`).toBe(true);
		}

		for (const template of templateFiles) {
			expect(referencedTemplates.has(template), `${template} must be referenced by schema.yaml`).toBe(true);
		}
	});

	it("keeps apply as the OpenSpec base execution instruction with no review gate", () => {
		const schema = loadSchema();
		expect(schema.apply?.requires).toEqual(["tasks"]);
		expect(schema.apply?.tracks).toBe("tasks.md");
		expect(schema.apply?.instruction?.trim()).toBe(
			"Read context files, work through pending tasks, mark complete as you go.\nPause if you hit blockers or need clarification.",
		);
	});

	it("does not define review artifacts in schema.yaml", () => {
		const schema = loadSchema();
		const artifacts = artifactById(schema);

		for (const id of artifacts.keys()) {
			expect(id.startsWith("review-"), `${id} must not be a schema artifact`).toBe(false);
		}
	});
});
