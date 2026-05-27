import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };

describe("package registration", () => {
	it("registers the advisor extension", () => {
		expect(pkg.pi.extensions).toEqual(["extensions/advisor"]);
	});

	it("publishes advisor assets", () => {
		expect(pkg.files).toContain("extensions/");
		expect(pkg.files).toContain("agents/");
		expect(pkg.files).toContain("prompts/");
	});
});
