import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("agent and skill contracts", () => {
	it("implement skill uses OpenSpec apply instructions and stops before archive/git workflows", () => {
		const text = readFileSync("skills/implement/SKILL.md", "utf-8");
		expect(text).toContain("openspec instructions apply --change <name> --json");
		expect(text).toContain("Verify implementation against proposal, specs, design, and tasks");
		expect(text).toContain("Run implementation review by invoking `review-implementation`");
		expect(text).toContain("Do not run archive, git commit, git push, PR creation, or finishing-branch behavior");
	});

	it("plan skill uses OpenSpec status/instructions and invokes planning review gates", () => {
		const text = readFileSync("skills/plan/SKILL.md", "utf-8");
		expect(text).toContain("openspec status --change <name> --json");
		expect(text).toContain("openspec instructions <artifact-id> --change <name> --json");
		expect(text).toContain("`review-proposal`");
		expect(text).toContain("`review-specs`");
		expect(text).toContain("`review-design`");
		expect(text).toContain("`review-tasks`");
		expect(text).toContain("Do not write application code");
	});

	it("review-implementation remains an explicit OpenSpec implementation review, not a package-registered generic review", () => {
		const text = readFileSync("skills/review-implementation/SKILL.md", "utf-8");
		expect(text).toContain("Review implementation work for a named OpenSpec change");
		expect(text).toContain("Use only when an OpenSpec workflow explicitly requests implementation review");
		expect(text).toContain("Return concise findings");
		expect(text).toContain("No issues found");
		expect(text).toContain("does not include commit, push, PR, archive, or finishing-branch behavior");
	});

	it("explore agent has codebase-memory and web tools without a generic explore skill", () => {
		const text = readFileSync("agents/explore.md", "utf-8");
		expect(text).toContain("codebase_memory_get_architecture");
		expect(text).toContain("web_search");
		expect(text).toContain("web_fetch");
		expect(text).not.toContain("skills/explore");
		expect(text).not.toContain("openspec-explore");
	});
});
