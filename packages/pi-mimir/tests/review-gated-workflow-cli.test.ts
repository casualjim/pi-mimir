import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE_SCHEMA_DIR = "openspec/schemas/review-gated";

const EXPECTED_OUTPUTS = new Map([
	["proposal", "proposal.md"],
	["design", "design.md"],
	["specs", "specs/**/*.md"],
	["tasks", "tasks.md"],
]);

type CmdResult = ReturnType<typeof spawnSync> & { combined: string };

function run(cwd: string, args: string[], allowFailure = false): CmdResult {
	const result = spawnSync("openspec", args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, OPENSPEC_TELEMETRY: "0" },
		timeout: 60_000,
		maxBuffer: 10 * 1024 * 1024,
	});
	const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
	if (result.status !== 0 && !allowFailure) {
		throw new Error(`openspec ${args.join(" ")} failed with ${result.status}\n${combined}`);
	}
	return Object.assign(result, { combined });
}

function json<T>(cwd: string, args: string[]): T {
	return JSON.parse(run(cwd, [...args, "--json"]).stdout.toString()) as T;
}

function setupProject(): { cwd: string; change: string } {
	const cwd = join(tmpdir(), `openspec-review-gated-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
	mkdirSync(join(cwd, "openspec", "schemas"), { recursive: true });
	cpSync(SOURCE_SCHEMA_DIR, join(cwd, "openspec", "schemas", "review-gated"), { recursive: true });
	writeFileSync(join(cwd, "openspec", "config.yaml"), "schema: review-gated\n");

	const change = "cli-review-flow";
	run(cwd, ["new", "change", change]);
	return { cwd, change };
}

function writePlanningArtifacts(cwd: string, change: string): void {
	const dir = join(cwd, "openspec", "changes", change);
	mkdirSync(join(dir, "specs", "sample-capability"), { recursive: true });
	writeFileSync(
		join(dir, "proposal.md"),
		[
			"## Why",
			"Exercise the review-gated CLI workflow.",
			"",
			"## What Changes",
			"- Add sample behavior.",
			"",
			"## Capabilities",
			"",
			"### New Capabilities",
			"- `sample-capability`: Sample behavior.",
			"",
			"### Modified Capabilities",
			"_(none)_",
			"",
			"## Impact",
			"- E2E fixture only.",
			"",
		].join("\n"),
	);
	writeFileSync(
		join(dir, "specs", "sample-capability", "spec.md"),
		[
			"## ADDED Requirements",
			"",
			"### Requirement: Sample behavior",
			"The system SHALL expose sample behavior.",
			"",
			"#### Scenario: Sample succeeds",
			"- **WHEN** the sample runs",
			"- **THEN** the sample passes",
			"",
		].join("\n"),
	);
	writeFileSync(
		join(dir, "design.md"),
		[
			"## Context",
			"CLI workflow fixture.",
			"",
			"## Goals / Non-Goals",
			"**Goals:**",
			"- Exercise schema graph.",
			"",
			"**Non-Goals:**",
			"- Application behavior.",
			"",
			"## Decisions",
			"Use minimal fixture artifacts.",
			"",
			"## Risks / Trade-offs",
			"Fixture-only coverage.",
			"",
		].join("\n"),
	);
	writeFileSync(join(dir, "tasks.md"), "## 1. Sample\n\n- [ ] 1.1 Implement sample behavior\n");
}

describe("review-gated OpenSpec workflow CLI behavior", () => {
	it("exposes the schema graph and apply gate without schema review artifacts", () => {
		const { cwd, change } = setupProject();
		try {
			const initial = json<any>(cwd, ["status", "--change", change]);
			expect(initial.schemaName).toBe("review-gated");
			expect(initial.applyRequires).toEqual(["tasks"]);
			expect(new Map(initial.artifacts.map((artifact: any) => [artifact.id, artifact.outputPath]))).toEqual(EXPECTED_OUTPUTS);
			expect(initial.artifacts.find((artifact: any) => artifact.id === "proposal").status).toBe("ready");
			expect(initial.artifacts.some((artifact: any) => artifact.id.startsWith("review-"))).toBe(false);

			writePlanningArtifacts(cwd, change);
			const readyForApply = json<any>(cwd, ["instructions", "apply", "--change", change]);
			expect(readyForApply.state).toBe("ready");
			expect(readyForApply.instruction).toBe(
				"Read context files, work through pending tasks, mark complete as you go.\nPause if you hit blockers or need clarification.",
			);
			expect(Object.keys(readyForApply.contextFiles)).toContain("tasks");
			expect(Object.keys(readyForApply.contextFiles).some((key) => key.startsWith("review-"))).toBe(false);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 60_000);
});
