import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function readSkill(name: string): string {
	return readFileSync(join("skills", name, "SKILL.md"), "utf-8");
}

function descriptionOf(text: string): string {
	return text.match(/^description: (.+)$/m)?.[1] ?? "";
}

describe("skill frontmatter", () => {
	it("every bundled skill has name and description frontmatter", () => {
		const skillsDir = "skills";
		for (const name of readdirSync(skillsDir)) {
			const text = readSkill(name);
			expect(text.startsWith("---\n"), `${name} missing frontmatter`).toBe(true);
			expect(text).toContain(`name: ${name}`);
			expect(text).toMatch(/description: .+/);
		}
	});

	it("uses narrow OpenSpec-specific public workflow descriptions", () => {
		expect(descriptionOf(readSkill("plan"))).toContain("OpenSpec");
		expect(descriptionOf(readSkill("plan"))).toContain("proposal");
		expect(descriptionOf(readSkill("implement"))).toContain("OpenSpec");
		expect(descriptionOf(readSkill("implement"))).toContain("explicit archive");
		expect(descriptionOf(readSkill("review-implementation"))).toContain("OpenSpec");
		expect(descriptionOf(readSkill("review-implementation"))).toContain("implementation review");
	});

	it("rejects broad over-triggering language in skill descriptions", () => {
		const broadPhrases = [
			"use before any creative work",
			"use whenever building anything",
			"use for any task",
			"use for all code review",
			"always use",
		];
		for (const name of readdirSync("skills")) {
			const description = descriptionOf(readSkill(name)).toLowerCase();
			for (const phrase of broadPhrases) {
				expect(description).not.toContain(phrase);
			}
		}
	});

	it("keeps implementation guidance out of archive, commit, push, and PR workflows", () => {
		const implement = readSkill("implement");
		expect(implement).toContain("Stop before explicit archive");
		expect(implement).toContain("Do not run archive, git commit, git push, PR creation, or finishing-branch behavior");
	});

	it("keeps review skills scoped to explicit OpenSpec review requests with evidence-based findings", () => {
		const gateSkills = readdirSync("skills").filter((entry) => entry.startsWith("review-"));
		for (const name of gateSkills) {
			const text = readSkill(name);
			const description = descriptionOf(text).toLowerCase();
			expect(description).toContain("openspec");
			expect(description).toContain("use only when");
			expect(description).not.toContain("all code review");
			expect(description).not.toContain("generic replacement");
			expect(text).toContain("Return concise findings");
			expect(text).toContain("<evidence>");
		}
	});
});
