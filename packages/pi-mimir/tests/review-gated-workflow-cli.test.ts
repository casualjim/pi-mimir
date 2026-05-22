import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE_SCHEMA_DIR = "openspec/schemas/review-gated";

const EXPECTED_OUTPUTS = new Map([
	["proposal", "proposal.md"],
	["review-proposal", "reviews/proposal.md"],
	["design", "design.md"],
	["review-design", "reviews/design.md"],
	["specs", "specs/**/*.md"],
	["review-specs", "reviews/specs.md"],
	["tasks", "tasks.md"],
	["review-tasks", "reviews/tasks.md"],
	["review-architecture", "reviews/architecture.md"],
	["review-data-flow", "reviews/data-flow.md"],
	["review-tests", "reviews/tests.md"],
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

function writePlanningReviewArtifacts(cwd: string, change: string): void {
	const reviewDir = join(cwd, "openspec", "changes", change, "reviews");
	mkdirSync(reviewDir, { recursive: true });
	for (const name of ["proposal", "specs", "design", "tasks"]) {
		writeFileSync(
			join(reviewDir, `${name}.md`),
			[
				"# Planning Artifact Review",
				"",
				"## Decision",
				"",
				"- [x] Pass",
				"- [ ] Pass with concerns",
				"- [ ] Fail",
				"",
			].join("\n"),
		);
	}
}

describe("review-gated OpenSpec workflow CLI behavior", () => {
	it("exposes the current schema graph, apply gate, and specialist review instructions", () => {
		const { cwd, change } = setupProject();
		try {
			const initial = json<any>(cwd, ["status", "--change", change]);
			expect(initial.schemaName).toBe("review-gated");
			expect(initial.applyRequires).toEqual(["tasks", "review-tasks"]);
			expect(new Map(initial.artifacts.map((artifact: any) => [artifact.id, artifact.outputPath]))).toEqual(EXPECTED_OUTPUTS);
			expect(initial.artifacts.find((artifact: any) => artifact.id === "proposal").status).toBe("ready");
			expect(initial.artifacts.find((artifact: any) => artifact.id === "review-tasks").missingDeps).toEqual(["tasks"]);

			writePlanningArtifacts(cwd, change);
			const readyForPlanningReviews = json<any>(cwd, ["status", "--change", change]);
			expect(readyForPlanningReviews.artifacts.find((artifact: any) => artifact.id === "review-proposal").status).toBe("ready");
			expect(readyForPlanningReviews.artifacts.find((artifact: any) => artifact.id === "review-tasks").status).toBe("ready");
			expect(readyForPlanningReviews.isComplete).toBe(false);

			const proposalReview = json<any>(cwd, ["instructions", "review-proposal", "--change", change]);
			expect(proposalReview.outputPath).toBe("reviews/proposal.md");
			expect(proposalReview.template).toContain("# Planning Artifact Review");
			expect(proposalReview.instruction).toContain("Review proposal.md as a proposal artifact.");

			const blockedApply = json<any>(cwd, ["instructions", "apply", "--change", change]);
			expect(blockedApply.state).toBe("blocked");
			expect(blockedApply.missingArtifacts).toEqual(["review-tasks"]);

			writePlanningReviewArtifacts(cwd, change);
			const applyReady = json<any>(cwd, ["instructions", "apply", "--change", change]);
			expect(applyReady.state).toBe("ready");
			expect(applyReady.instruction).toBe(
				"Read context files, work through pending tasks, mark complete as you go.\nPause if you hit blockers or need clarification.",
			);
			expect(applyReady.contextFiles.tasks.map((file: string) => realpathSync(file))).toEqual([
				realpathSync(join(cwd, "openspec", "changes", change, "tasks.md")),
			]);
			expect(applyReady.contextFiles["review-tasks"].map((file: string) => realpathSync(file))).toEqual([
				realpathSync(join(cwd, "openspec", "changes", change, "reviews", "tasks.md")),
			]);

			const readyForSpecialistReviews = json<any>(cwd, ["status", "--change", change]);
			expect(readyForSpecialistReviews.artifacts.find((artifact: any) => artifact.id === "review-tests").status).toBe("ready");
			expect(readyForSpecialistReviews.artifacts.find((artifact: any) => artifact.id === "review-architecture").status).toBe("ready");
			expect(readyForSpecialistReviews.artifacts.find((artifact: any) => artifact.id === "review-data-flow").status).toBe("ready");

			const testsReview = json<any>(cwd, ["instructions", "review-tests", "--change", change]);
			expect(testsReview.outputPath).toBe("reviews/tests.md");
			expect(testsReview.instruction).toContain("Test Reviewer");
			expect(testsReview.instruction).toContain("meaningful implemented test coverage");

			const architectureReview = json<any>(cwd, ["instructions", "review-architecture", "--change", change]);
			expect(architectureReview.outputPath).toBe("reviews/architecture.md");
			expect(architectureReview.instruction).toContain("Architecture Reviewer");
			expect(architectureReview.instruction).toContain("Redundant helpers");
			expect(architectureReview.instruction).toContain("Owned behavior shape");

			const dataFlowReview = json<any>(cwd, ["instructions", "review-data-flow", "--change", change]);
			expect(dataFlowReview.outputPath).toBe("reviews/data-flow.md");
			expect(dataFlowReview.instruction).toContain("Data-Flow Reviewer");
			expect(dataFlowReview.instruction).toContain("Reduction before pagination");
			expect(dataFlowReview.instruction).toContain("Allocation and duplication pressure");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 60_000);
});
