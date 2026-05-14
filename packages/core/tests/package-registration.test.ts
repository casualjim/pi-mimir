import { describe, it, expect } from "vitest";
import pkg from "../package.json" with { type: "json" };

describe("package registration", () => {
	it("registers plan, implement, explicit review workflows, and OpenSpec review gate skills", () => {
		expect(pkg.pi.skills).toEqual([
			"skills/plan",
			"skills/implement",
			"skills/review-plan",
			"skills/review-implementation",
			"skills/review-proposal",
			"skills/review-specs",
			"skills/review-design",
			"skills/review-tasks",
			"skills/review-claims",
			"skills/review-architecture",
			"skills/review-tests",
			"skills/review-performance",
			"skills/review-security",
		]);
	});

	it("keeps plan, implement, and explicit review workflows as the only primary workflow entrypoints", () => {
		const gateSkills = new Set([
			"skills/review-proposal",
			"skills/review-specs",
			"skills/review-design",
			"skills/review-tasks",
			"skills/review-claims",
			"skills/review-architecture",
			"skills/review-tests",
			"skills/review-performance",
			"skills/review-security",
		]);
		const primary = pkg.pi.skills.filter((skill) => !gateSkills.has(skill));
		expect(primary).toEqual(["skills/plan", "skills/implement", "skills/review-plan", "skills/review-implementation"]);
	});

	it("does not register extra generic planning, review, or commit skills", () => {
		const allowed = new Set(["skills/plan", "skills/implement", "skills/review-plan", "skills/review-implementation"]);
		const forbidden = ["research", "design", "blueprint", "validate", "review", "commit"];
		for (const skill of pkg.pi.skills) {
			if (allowed.has(skill)) continue;
			expect(forbidden.some((name) => skill === `skills/${name}` || skill.endsWith(`/${name}`))).toBe(false);
		}
	});

	it("does not depend on rpiv-pi", () => {
		const deps = { ...(pkg as any).dependencies, ...(pkg as any).peerDependencies, ...(pkg as any).devDependencies };
		expect(deps).not.toHaveProperty("@juicesharp/rpiv-pi");
	});
});
