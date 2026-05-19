import { describe, it, expect } from "vitest";
import pkg from "../package.json" with { type: "json" };

describe("package registration", () => {
	it("registers only the public plan and implement workflow entrypoints", () => {
		expect(pkg.pi.skills).toEqual(["skills/plan", "skills/implement"]);
	});

	it("does not register review gates as standalone public package skills", () => {
		for (const skill of pkg.pi.skills) {
			expect(skill.startsWith("skills/review-")).toBe(false);
		}
	});

	it("does not register extra generic planning, review, or commit skills", () => {
		const allowed = new Set(["skills/plan", "skills/implement"]);
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
