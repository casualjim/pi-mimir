import { describe, it, expect } from "vitest";
import pkg from "../package.json" with { type: "json" };

describe("package registration", () => {
	it("publishes the crumbs skill and extension", () => {
		expect((pkg.pi.skills ?? [])).toContain("skills");
		expect((pkg.pi.extensions ?? [])).toContain("extensions/crumbs");
	});

	it("declares no bundled binary dependency", () => {
		const deps = (pkg as any).dependencies ?? {};
		expect(deps).not.toHaveProperty("codebase-memory-mcp");
		expect(deps).not.toHaveProperty("crumbs");
	});
});
