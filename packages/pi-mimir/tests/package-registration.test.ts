import { describe, it, expect } from "vitest";
import pkg from "../package.json" with { type: "json" };

function registeredSkills(): string[] {
	return (pkg.pi.skills ?? []) as string[];
}

describe("package registration", () => {
	it("does not register copied skill seeds as public package skills", () => {
		expect(registeredSkills()).toEqual([]);
	});

	it("keeps copied skill seeds as packaged assets outside Pi's direct skills directory", () => {
		expect(pkg.files).toContain("skillseeds/");
		expect(pkg.files).not.toContain("skills/");
	});

	it("does not publish generic codebase-memory assets anymore", () => {
		expect(pkg.files).not.toContain("skills/");
		expect((pkg as any).dependencies).not.toHaveProperty("codebase-memory-mcp");
		expect((pkg as any).peerDependencies ?? {}).not.toHaveProperty("pi-mcp-adapter");
	});
});
