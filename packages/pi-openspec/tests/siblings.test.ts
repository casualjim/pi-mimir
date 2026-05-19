import { describe, it, expect } from "vitest";
import { SIBLINGS } from "../extensions/openspec/siblings.js";

describe("siblings", () => {
	it("has exactly 7 sibling entries", () => {
		expect(SIBLINGS).toHaveLength(7);
	});

	it("each sibling has pkg, matches, and provides", () => {
		for (const s of SIBLINGS) {
			expect(s.pkg).toBeTruthy();
			expect(s.matches).toBeInstanceOf(RegExp);
			expect(s.provides).toBeTruthy();
		}
	});

	it("includes pi-subagents", () => {
		const sub = SIBLINGS.find((s) => s.pkg.includes("pi-subagents"));
		expect(sub).toBeDefined();
		expect(sub!.provides).toContain("subagent");
	});

	it("includes rpiv-todo", () => {
		const todo = SIBLINGS.find((s) => s.pkg.includes("rpiv-todo"));
		expect(todo).toBeDefined();
		expect(todo!.provides).toContain("todo");
	});

	it("includes rpiv-ask-user-question", () => {
		const ask = SIBLINGS.find((s) => s.pkg.includes("rpiv-ask-user-question"));
		expect(ask).toBeDefined();
		expect(ask!.provides).toContain("ask_user_question");
	});

	it("includes rpiv-web-tools", () => {
		const web = SIBLINGS.find((s) => s.pkg.includes("rpiv-web-tools"));
		expect(web).toBeDefined();
		expect(web!.provides).toContain("web_search");
	});

	it("includes rpiv-args", () => {
		const args = SIBLINGS.find((s) => s.pkg.includes("rpiv-args"));
		expect(args).toBeDefined();
		expect(args!.provides).toContain("$ARGUMENTS");
	});

	it("includes rpiv-btw", () => {
		const btw = SIBLINGS.find((s) => s.pkg.includes("rpiv-btw"));
		expect(btw).toBeDefined();
		expect(btw!.provides).toContain("between-turn");
	});

	it("includes pi-mcp-adapter", () => {
		const adapter = SIBLINGS.find((s) => s.pkg.includes("pi-mcp-adapter"));
		expect(adapter).toBeDefined();
		expect(adapter!.provides).toContain("MCP adapter");
	});

	it("matchers match their own package names", () => {
		for (const s of SIBLINGS) {
			const pkgName = s.pkg.replace(/^npm:/, "");
			expect(s.matches.test(pkgName)).toBe(true);
		}
	});

	it("rpiv-args matcher does not match rpiv-args-helper", () => {
		const args = SIBLINGS.find((s) => s.pkg.includes("rpiv-args"))!;
		expect(args.matches.test("npm:@juicesharp/rpiv-args-helper@1.0.0")).toBe(false);
	});

	it("all packages are prefixed with npm:", () => {
		for (const s of SIBLINGS) {
			expect(s.pkg).toMatch(/^npm:/);
		}
	});
});
