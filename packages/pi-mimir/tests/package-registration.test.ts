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

	it("does not register review gates as standalone public package skills", () => {
		for (const skill of registeredSkills()) {
			expect(skill.startsWith("skills/review-")).toBe(false);
			expect(skill.startsWith("skillseeds/review-")).toBe(false);
		}
	});

	it("does not register extra generic planning, review, or commit skills", () => {
		const forbidden = ["research", "design", "blueprint", "validate", "review", "commit"];
		for (const skill of registeredSkills()) {
			expect(forbidden.some((name) => skill === `skills/${name}` || skill.endsWith(`/${name}`))).toBe(false);
		}
	});

	it("removes rpiv-era optional peers, keeps pi-mcp-adapter, and bundles codebase-memory-mcp", () => {
		const peers = (pkg as any).peerDependencies ?? {};
		const peerMeta = (pkg as any).peerDependenciesMeta ?? {};
		for (const name of [
			"@tintinweb/pi-subagents",
			"@juicesharp/rpiv-ask-user-question",
			"@juicesharp/rpiv-todo",
			"@juicesharp/rpiv-web-tools",
			"@juicesharp/rpiv-args",
			"@juicesharp/rpiv-btw",
			"@juicesharp/rpiv-pi",
		]) {
			expect(peers).not.toHaveProperty(name);
			expect(peerMeta).not.toHaveProperty(name);
		}
		expect(peers).toHaveProperty("pi-mcp-adapter");
		expect(peerMeta["pi-mcp-adapter"]?.optional).toBe(true);
		expect((pkg as any).dependencies).toHaveProperty("codebase-memory-mcp");
	});
});
