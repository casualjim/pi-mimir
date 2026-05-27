import { describe, it, expect } from "vitest";
import pkg from "../package.json" with { type: "json" };

describe("package registration", () => {
	it("publishes the codebase-memory skill and extension", () => {
		expect((pkg.pi.skills ?? [])).toContain("skills");
		expect((pkg.pi.extensions ?? [])).toContain("extensions/codebase-memory");
	});

	it("bundles codebase-memory-mcp", () => {
		expect((pkg as any).dependencies).toHaveProperty("codebase-memory-mcp");
	});
});
