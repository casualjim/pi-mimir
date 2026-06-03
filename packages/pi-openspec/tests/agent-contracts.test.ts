import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("agent and skill contracts", () => {
	it("implement skill orchestrates worker plus verification and keeps review optional", () => {
		const text = readFileSync("skillseeds/implement/SKILL.md", "utf-8");
		expect(text).toContain("openspec instructions apply --change <name> --json");
		expect(text).toContain("Invoke the worker subagent");
		expect(text).toContain("Verify implementation against proposal, specs, design, and tasks");
		expect(text).toContain("/skill:review-implementation <change-name>");
		expect(text).toContain("@casualjim/pi-review");
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
		expect(text).toContain("Apply a materiality filter");
		expect(text).toContain("Do not emit findings for wording-only");
	});

	it("reviewer loads consolidated planning review only", () => {
		const text = readFileSync("agents/reviewer.md", "utf-8");
		expect(text).toContain("skills: review-plan, openspec-verify-change");
		expect(text).not.toContain("review-implementation");
		expect(text).not.toContain("review-architecture");
		expect(text).not.toContain("review-tests");
		expect(text).not.toContain("review-data-flow");
		expect(text).not.toContain("review-security");
		expect(text).not.toContain("review-proposal");
		expect(text).not.toContain("review-specs");
		expect(text).not.toContain("review-design");
		expect(text).not.toContain("review-tasks");
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
