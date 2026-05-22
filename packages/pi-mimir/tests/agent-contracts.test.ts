import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("agent and skill contracts", () => {
	it("implement skill orchestrates worker, verification, and parallel review gates", () => {
		const text = readFileSync("skillseeds/implement/SKILL.md", "utf-8");
		expect(text).toContain("openspec instructions apply --change <name> --json");
		expect(text).toContain("Invoke the worker subagent");
		expect(text).toContain("Run implementation review gates in parallel as reviewer subagents");
		expect(text).toContain("/skill:review-architecture <change-name>");
		expect(text).toContain("Stop after at most 5 review/fix iterations");
		expect(text).toContain("Do not archive");
	});

	it("plan skill invokes propose and parallel planning review gates", () => {
		const text = readFileSync("skillseeds/plan/SKILL.md", "utf-8");
		expect(text).toContain("/skill:openspec-propose <change-name>");
		expect(text).toContain("run review gates in parallel as reviewer subagents");
		expect(text).toContain("/skill:review-proposal <change-name>");
		expect(text).toContain("/skill:review-specs <change-name>");
		expect(text).toContain("/skill:review-design <change-name>");
		expect(text).toContain("/skill:review-tasks <change-name>");
		expect(text).toContain("Stop after at most 5 review/propose iterations");
		expect(text).toContain("Do not write application code");
	});

	it("review-architecture skill covers non-dogmatic architecture/refactoring concepts", () => {
		const text = readFileSync("skillseeds/review-architecture/SKILL.md", "utf-8");
		expect(text).toContain("Good architecture is not dogma");
		expect(text).toContain("not one discipline");
		expect(text).toContain("not a search for perfect architecture");
		expect(text).toContain("verbose abstraction for its own sake");
		expect(text).toContain("separates concerns");
		expect(text).toContain("preserves maintainability");
		expect(text).toContain("Architecture is not file structure");
		expect(text).toContain("Architecture is about the important stuff");
		expect(text).toContain("Conway");
		expect(text).toContain("Monolith First");
		expect(text).toContain("Strangler Fig Pattern");
		expect(text).toContain("Branch by Abstraction");
		expect(text).toContain("Refactoring has a precise meaning");
		expect(text).toContain("Command Query Separation");
		expect(text).toContain("Do not force repositories into a feature-folder model");
		expect(text).toContain("No grids or tables");
	});

	it("review-tests skill reviews test quality with adversarial evidence standards", () => {
		const text = readFileSync("skillseeds/review-tests/SKILL.md", "utf-8");
		expect(text).toContain("Tests are evidence");
		expect(text).toContain("Tautologies");
		expect(text).toContain("Happy-path-only coverage");
		expect(text).toContain("Missing property tests");
		expect(text).toContain("Missing fuzzing");
		expect(text).toContain("Mock damage");
		expect(text).toContain("No grids or tables");
		expect(text).toContain("Return concise findings");
	});

	it("review-performance skill reviews structural performance costs without micro-optimization filler", () => {
		const text = readFileSync("skillseeds/review-performance/SKILL.md", "utf-8");
		expect(text).toContain("premature stream materialization");
		expect(text).toContain("Needless copying");
		expect(text).toContain("N+1");
		expect(text).toContain("Language lenses");
		expect(text).toContain("No grids or tables");
		expect(text).toContain("Return concise findings");
	});

	it("review-security skill reviews exploit paths through trust boundaries without checklist filler", () => {
		const text = readFileSync("skillseeds/review-security/SKILL.md", "utf-8");
		expect(text).toContain("assets, actors, attacker-controlled inputs");
		expect(text).toContain("trust boundaries");
		expect(text).toContain("enforcement points");
		expect(text).toContain("Exploit path");
		expect(text).toContain("No grids or tables");
		expect(text).toContain("Return concise findings");
	});

	it("specialist review skills avoid workflow integration metadata and change-only scope", () => {
		const forbidden = [
			"this skill is standalone",
			"ordinary code review",
			"pi-mimir",
			"this application",
			"this conversation",
			"review the implemented change",
			"implemented changes",
			"changed code",
			"changed production code",
			"changed implementation files",
			"current diff",
			"current change",
		];
		for (const name of ["review-architecture", "review-tests", "review-performance", "review-security"]) {
			const text = readFileSync(`skillseeds/${name}/SKILL.md`, "utf-8");
			const lower = text.toLowerCase();
			expect(text).not.toContain("OpenSpec");
			for (const phrase of forbidden) expect(lower).not.toContain(phrase);
		}
	});

	it("review-implementation remains an explicit OpenSpec implementation review, not a package-registered generic review", () => {
		const text = readFileSync("skillseeds/review-implementation/SKILL.md", "utf-8");
		expect(text).toContain("Review implementation work for a named OpenSpec change");
		expect(text).toContain("Use only when an OpenSpec workflow explicitly requests implementation review");
		expect(text).toContain("Return concise findings");
		expect(text).toContain("No issues found");
		expect(text).toContain("`review-architecture`");
		expect(text).toContain("`review-tests`");
		expect(text).toContain("`review-performance`");
		expect(text).toContain("`review-security`");
		expect(text).toContain("does not include commit, push, PR, archive, or finishing-branch behavior");
	});

	it("planner agent focuses on artifact quality from supplied context", () => {
		const text = readFileSync("agents/planner.md", "utf-8");
		expect(text).toContain("Write clear, review-ready OpenSpec planning artifacts");
		expect(text).toContain("Separate requirements from design");
		expect(text).toContain("Use only supplied context");
		expect(text).toContain("Do not perform broad discovery");
	});

	it("reviewer asks what was missed", () => {
		const reviewer = readFileSync("agents/reviewer.md", "utf-8");
		expect(reviewer).toContain("Always ask: what did we miss?");
		for (const name of ["review-proposal", "review-specs", "review-design", "review-tasks"]) {
			const text = readFileSync(`skillseeds/${name}/SKILL.md`, "utf-8");
			expect(text).toContain("what did we miss?");
		}
	});
});
