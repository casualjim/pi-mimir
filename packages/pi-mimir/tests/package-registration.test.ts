import { describe, it, expect } from "vitest";
import pkg from "../package.json" with { type: "json" };

function registeredSkills(): string[] {
	return (pkg.pi.skills ?? []) as string[];
}

describe("package registration", () => {
	it("registers packaged skill seeds as package-provided Pi skills", () => {
		expect(registeredSkills()).toEqual(["./skillseeds"]);
	});

	it("keeps skill seeds and agents as packaged assets", () => {
		expect(pkg.files).toContain("skillseeds/");
		expect(pkg.files).toContain("agents/");
		expect(pkg.files).not.toContain("skills/");
	});

	it("does not publish generic codebase-memory assets anymore", () => {
		expect(pkg.files).not.toContain("skills/");
		expect((pkg as any).dependencies).not.toHaveProperty("codebase-memory-mcp");
		expect((pkg as any).peerDependencies ?? {}).not.toHaveProperty("pi-mcp-adapter");
	});
});
