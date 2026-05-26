import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("agent and skill contracts", () => {
	it("implement skill orchestrates worker plus verification and keeps review optional", () => {
		const text = readFileSync("skillseeds/implement/SKILL.md", "utf-8");
		expect(text).toContain("openspec instructions apply --change <name> --json");
		expect(text).toContain("Invoke the worker subagent");
		expect(text).toContain("Verify implementation against proposal, specs, design, and tasks");
		expect(text).toContain("/skill:review-implementation <change-name>");
		expect(text).toContain("Separate implementation review is optional");
		expect(text).toContain("Do not invent review files");
		expect(text).toContain("Do not archive");
	});

	it("plan skill invokes propose and one consolidated planning review", () => {
		const text = readFileSync("skillseeds/plan/SKILL.md", "utf-8");
		expect(text).toContain("/skill:openspec-propose <change-name>");
		expect(text).toContain("run one planning review as a `reviewer` subagent");
		expect(text).toContain("/skill:review-plan <change-name>");
		expect(text).toContain("run one planning review as a `reviewer` subagent");
		expect(text).toContain("update only the targeted artifact");
		expect(text).toContain("ask the user instead of guessing");
		expect(text).toContain("Stop after at most 5 review/fix iterations");
		expect(text).toContain("Do not write application code");
	});

	it("review-plan consolidates proposal, specs, design, and tasks review instructions", () => {
		const text = readFileSync("skillseeds/review-plan/SKILL.md", "utf-8");
		expect(text).toContain("### Proposal checks");
		expect(text).toContain("names new and modified capabilities consistently");
		expect(text).toContain("### Specs checks");
		expect(text).toContain("include at least one `#### Scenario:` per requirement");
		expect(text).toContain("### Design checks");
		expect(text).toContain("contains concrete decisions, rationale, trade-offs");
		expect(text).toContain("### Tasks checks");
		expect(text).toContain("use parseable checkbox format `- [ ] X.Y Task description`");
		expect(text).toContain("### Cross-artifact coherence checks");
		expect(text).toContain("Review proposal/specs/design/tasks together as one planning review.");
		expect(text).toContain("The review is single-shot");
		expect(text).toContain("net new issues");
	});

	it("reviewer loads consolidated planning review instead of artifact-specific planning skills", () => {
		const text = readFileSync("agents/reviewer.md", "utf-8");
		expect(text).toContain("skills: review-plan, review-implementation, review-architecture, review-tests, review-data-flow, review-security, openspec-verify-change");
		expect(text).not.toContain("review-proposal");
		expect(text).not.toContain("review-specs");
		expect(text).not.toContain("review-design");
		expect(text).not.toContain("review-tasks");
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
		expect(text).toContain("Architecture Review Report");
		expect(text).toContain("### Issues by Priority");
	});

	it("review-tests skill reviews test quality with adversarial evidence standards", () => {
		const text = readFileSync("skillseeds/review-tests/SKILL.md", "utf-8");
		expect(text).toContain("Tests are evidence");
		expect(text).toContain("Tautologies");
		expect(text).toContain("Happy-path-only coverage");
		expect(text).toContain("Missing property tests");
		expect(text).toContain("Missing fuzzing");
		expect(text).toContain("Mock damage");
		expect(text).toContain("Test Review Report");
		expect(text).toContain("### Issues by Priority");
	});

	it("review-data-flow skill reviews structural data-flow costs without micro-optimization filler", () => {
		const text = readFileSync("skillseeds/review-data-flow/SKILL.md", "utf-8");
		expect(text).toContain("Streaming until sink");
		expect(text).toContain("Needless copying");
		expect(text).toContain("N+1");
		expect(text).toContain("Language lenses");
		expect(text).toContain("Data-flow Review Report");
		expect(text).toContain("### Issues by Priority");
	});

	it("review-security skill reviews exploit paths through trust boundaries without checklist filler", () => {
		const text = readFileSync("skillseeds/review-security/SKILL.md", "utf-8");
		expect(text).toContain("assets, actors, attacker-controlled inputs");
		expect(text).toContain("trust boundaries");
		expect(text).toContain("enforcement points");
		expect(text).toContain("Asset at risk");
		expect(text).toContain("Security Review Report");
		expect(text).toContain("### Issues by Priority");
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
		for (const name of ["review-architecture", "review-tests", "review-data-flow", "review-security"]) {
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
		expect(text).toContain("Implementation Review Report");
		expect(text).toContain("Report the whole issue list");
		expect(text).toContain("do not limit output to the highest-severity actionable set");
		expect(text).toContain("/skill:review-architecture <change-name>");
		expect(text).toContain("/skill:review-tests <change-name>");
		expect(text).toContain("/skill:review-data-flow <change-name>");
		expect(text).toContain("/skill:review-security <change-name>");
		expect(text).toContain("does not include commit, push, PR, archive, or finishing-branch behavior");
	});

	it("planner agent focuses on artifact quality from supplied context", () => {
		const text = readFileSync("agents/planner.md", "utf-8");
		expect(text).toContain("Write clear, review-ready OpenSpec planning artifacts");
		expect(text).toContain("Separate requirements from design");
		expect(text).toContain("Use only supplied context");
		expect(text).toContain("Do not perform broad discovery");
	});

	it("reviewer requires structured findings, artifact routing, and user-decision flags", () => {
		const reviewer = readFileSync("agents/reviewer.md", "utf-8");
		expect(reviewer).toContain("requires a product, scope, or design decision");
		expect(reviewer).toContain("Treat every review as single-shot");
		expect(reviewer).toContain("Target artifact:");
		expect(reviewer).toContain("### Issues by Priority");
		expect(reviewer).toContain("Report the whole actionable issue list");
		const text = readFileSync("skillseeds/review-plan/SKILL.md", "utf-8");
		expect(text).toContain("Requires user decision:");
		expect(text).toContain("### Summary");
		expect(text).toContain("### Final Assessment");
		expect(text).not.toContain("what did we miss?");
	});
});
