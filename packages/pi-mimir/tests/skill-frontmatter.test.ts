import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function readSkillSeed(name: string): string {
	return readFileSync(join("skillseeds", name, "SKILL.md"), "utf-8");
}

function descriptionOf(text: string): string {
	return text.match(/^description: (.+)$/m)?.[1] ?? "";
}

describe("skill frontmatter", () => {
	it("every bundled skill has name and description frontmatter", () => {
		const skillSeedsDir = "skillseeds";
		for (const name of readdirSync(skillSeedsDir)) {
			const text = readSkillSeed(name);
			expect(text.startsWith("---\n"), `${name} missing frontmatter`).toBe(true);
			expect(text).toContain(`name: ${name}`);
			expect(text).toMatch(/description: .+/);
		}
	});

	it("uses narrow OpenSpec-specific public workflow descriptions", () => {
		expect(descriptionOf(readSkillSeed("plan"))).toContain("OpenSpec");
		expect(descriptionOf(readSkillSeed("plan"))).toContain("proposal");
		expect(descriptionOf(readSkillSeed("implement"))).toContain("OpenSpec");
		expect(descriptionOf(readSkillSeed("implement"))).toContain("explicit archive");
		expect(descriptionOf(readSkillSeed("review-implementation"))).toContain("OpenSpec");
		expect(descriptionOf(readSkillSeed("review-implementation"))).toContain("implementation review");
	});

	it("marks composed workflow entrypoints as manual-only skills", () => {
		expect(readSkillSeed("plan")).toContain("disable-model-invocation: true");
		expect(readSkillSeed("implement")).toContain("disable-model-invocation: true");
	});

	it("rejects broad over-triggering language in skill descriptions", () => {
		const broadPhrases = [
			"use before any creative work",
			"use whenever building anything",
			"use for any task",
			"use for all code review",
			"always use",
		];
		for (const name of readdirSync("skillseeds")) {
			const description = descriptionOf(readSkillSeed(name)).toLowerCase();
			for (const phrase of broadPhrases) {
				expect(description).not.toContain(phrase);
			}
		}
	});

	it("keeps implementation guidance out of archive, commit, push, and PR workflows", () => {
		const implement = readSkillSeed("implement");
		expect(implement).toContain("whether the change is ready for explicit archive");
		expect(implement).toContain("Do not archive");
		expect(implement).toContain("Do not commit, push, create PRs, deploy, or run release steps");
	});

	it("keeps review skills scoped to explicit review requests with evidence-based findings", () => {
		const gateSkills = readdirSync("skillseeds").filter((entry) => entry.startsWith("review-"));
		for (const name of gateSkills) {
			const text = readSkillSeed(name);
			const textLower = text.toLowerCase();
			const description = descriptionOf(text).toLowerCase();
			expect(description).toMatch(/use (only )?when/);
			expect(description).not.toContain("all code review");
			expect(description).not.toContain("generic replacement");
			expect(textLower).not.toContain("this skill is standalone");
			expect(textLower).not.toContain("ordinary code review");
			expect(textLower).not.toContain("pi-mimir");
			expect(textLower).not.toContain("this application");
			expect(textLower).not.toContain("this conversation");
			expect(text).toContain("### Issues by Priority");
			expect(text).toContain("Evidence:");
			expect(text).toContain("single-shot");
			expect(text).toContain("net new issues");
			expect(text).toMatch(/whole (actionable )?issue list/i);
			expect(text).not.toContain("<severity> |");
		}
	});
});
