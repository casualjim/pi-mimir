import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE_SCHEMA_DIR = "openspec/schemas/review-gated";

type CmdResult = ReturnType<typeof spawnSync> & { combined: string };

function run(cwd: string, args: string[], allowFailure = false): CmdResult {
	const result = spawnSync("openspec", args, {
		cwd,
		encoding: "utf8",
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
	mkdirSync(cwd, { recursive: true });
	run(cwd, ["init", ".", "--tools", "pi", "--force"]);
	mkdirSync(join(cwd, "openspec", "schemas"), { recursive: true });
	cpSync(SOURCE_SCHEMA_DIR, join(cwd, "openspec", "schemas", "review-gated"), { recursive: true });
	writeFileSync(join(cwd, "openspec", "config.yaml"), "schema: review-gated\n");
	run(cwd, ["update", "--force", "."]);

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
		writeFileSync(join(reviewDir, `${name}.md`), `# ${name} review\n\n## Result\n\n- [x] PASS — no blockers or unresolved concerns.\n`);
	}
}

describe("review-gated OpenSpec workflow CLI behavior", () => {
	it("expands the default workflow with schema-owned review milestones and generated Pi skills use those milestones", () => {
		const { cwd, change } = setupProject();
		try {
			const proposeSkill = readFileSync(join(cwd, ".pi", "skills", "openspec-propose", "SKILL.md"), "utf8");
			const applySkill = readFileSync(join(cwd, ".pi", "skills", "openspec-apply-change", "SKILL.md"), "utf8");

			// Generated OpenSpec skills must be milestone-driven, not hard-coded to tasks.
			expect(proposeSkill).toContain("applyRequires");
			expect(proposeSkill).toContain("Continue until all `applyRequires` artifacts are complete");
			expect(applySkill).toContain("openspec instructions apply");
			expect(applySkill).toContain("contextFiles");

			const initial = json<any>(cwd, ["status", "--change", change]);
			expect(initial.schemaName).toBe("review-gated");
			expect(initial.applyRequires).toEqual(["review-tasks"]);
			expect(new Map(initial.artifacts.map((a: any) => [a.id, a.outputPath]))).toEqual(
				new Map([
					["proposal", "proposal.md"],
					["design", "design.md"],
					["specs", "specs/**/*.md"],
					["tasks", "tasks.md"],
					["review-proposal", "reviews/proposal.md"],
					["review-specs", "reviews/specs.md"],
					["review-design", "reviews/design.md"],
					["review-tasks", "reviews/tasks.md"],
					["review-claims", "reviews/claims.md"],
					["review-architecture", "reviews/architecture.md"],
					["review-tests", "reviews/tests.md"],
					["review-performance", "reviews/performance.md"],
					["review-security", "reviews/security.md"],
				]),
			);

			writePlanningArtifacts(cwd, change);
			const readyForReview = json<any>(cwd, ["status", "--change", change]);
			expect(readyForReview.artifacts.find((a: any) => a.id === "review-proposal").status).toBe("ready");
			expect(readyForReview.isComplete).toBe(false);

			const proposalReview = json<any>(cwd, ["instructions", "review-proposal", "--change", change]);
			expect(proposalReview.outputPath).toBe("reviews/proposal.md");
			expect(proposalReview.template).toContain("# Proposal Review");
			expect(proposalReview.instruction).toContain("/skill:review-proposal <change-name>");

			const blockedApply = json<any>(cwd, ["instructions", "apply", "--change", change]);
			expect(blockedApply.state).toBe("blocked");
			expect(blockedApply.missingArtifacts).toEqual(["review-tasks"]);

			writePlanningReviewArtifacts(cwd, change);
			const applyReady = json<any>(cwd, ["instructions", "apply", "--change", change]);
			expect(applyReady.state).toBe("ready");
			expect(applyReady.contextFiles["review-tasks"].map((p: string) => realpathSync(p))).toEqual([
				realpathSync(join(cwd, "openspec", "changes", change, "reviews", "tasks.md")),
			]);
			expect(applyReady.instruction).toContain("Run claim, architecture, tests, performance, and security review gates only after verification passes.");

			const claimsReview = json<any>(cwd, ["instructions", "review-claims", "--change", change]);
			expect(claimsReview.outputPath).toBe("reviews/claims.md");
			expect(claimsReview.template).toContain("# Claims Review");
			expect(claimsReview.instruction).toContain("/skill:review-claims <change-name>");

			const securityReview = json<any>(cwd, ["instructions", "review-security", "--change", change]);
			expect(securityReview.outputPath).toBe("reviews/security.md");
			expect(securityReview.template).toContain("# Security Review");
			expect(securityReview.instruction).toContain("/skill:review-security <change-name>");
			expect(securityReview.instruction).toContain("explicit OpenSpec archive behavior separately");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
