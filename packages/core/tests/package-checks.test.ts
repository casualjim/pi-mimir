import { describe, it, expect } from "vitest";
import { findMissingSiblings } from "../extensions/openspec-core/package-checks.js";
import { SIBLINGS } from "../extensions/openspec-core/siblings.js";

describe("package-checks", () => {
	describe("findMissingSiblings", () => {
		it("returns an array", () => {
			const result = findMissingSiblings();
			expect(Array.isArray(result)).toBe(true);
		});

		it("each entry has pkg, matches, and provides", () => {
			const result = findMissingSiblings();
			for (const s of result) {
				expect(s.pkg).toBeTruthy();
				expect(s.matches).toBeInstanceOf(RegExp);
				expect(s.provides).toBeTruthy();
			}
		});

		it("returns a subset of the siblings registry", () => {
			const result = findMissingSiblings();
			for (const m of result) {
				expect(SIBLINGS.some((s) => s.pkg === m.pkg)).toBe(true);
			}
		});

		it("result count is between 0 and SIBLINGS.length", () => {
			const result = findMissingSiblings();
			expect(result.length).toBeGreaterThanOrEqual(0);
			expect(result.length).toBeLessThanOrEqual(SIBLINGS.length);
		});
	});
});
