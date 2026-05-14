import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("agent and skill contracts", () => {
	it("implement skill delegates isolated apply with required skill prefix", () => {
		const text = readFileSync("skills/implement/SKILL.md", "utf-8");
		expect(text).toContain("/skill:openspec-apply-change <change-name>");
		expect(text).toMatch(/isolated `apply` agent|apply agent does not inherit context/);
	});

	it("plan skill documents the required OpenSpec skill-agent prefix", () => {
		const text = readFileSync("skills/plan/SKILL.md", "utf-8");
		expect(text).toContain("/skill:<openspec-skill-name> <change-name>");
		expect(text).toContain("planning and plan-verification subagents inherit the active context");
	});

	it("review-plan invokes artifact review gates", () => {
		const text = readFileSync("skills/review-plan/SKILL.md", "utf-8");
		expect(text).toContain("/skill:review-proposal <change-name>");
		expect(text).toContain("/skill:review-specs <change-name>");
		expect(text).toContain("/skill:review-design <change-name>");
		expect(text).toContain("/skill:review-tasks <change-name>");
		expect(text).toContain("not a generic planning review");
	});

	it("review-implementation invokes implementation review gates", () => {
		const text = readFileSync("skills/review-implementation/SKILL.md", "utf-8");
		expect(text).toContain("/skill:review-claims <change-name>");
		expect(text).toContain("/skill:review-architecture <change-name>");
		expect(text).toContain("/skill:review-tests <change-name>");
		expect(text).toContain("/skill:review-performance <change-name>");
		expect(text).toContain("/skill:review-security <change-name>");
		expect(text).toContain("not a generic code review");
	});

	it("explore agent has codebase-memory and web tools without a generic explore skill", () => {
		const text = readFileSync("agents/explore.md", "utf-8");
		expect(text).toContain("codebase_memory_get_architecture");
		expect(text).toContain("web_search");
		expect(text).toContain("web_fetch");
		expect(text).not.toContain("skills/explore");
		expect(text).not.toContain("openspec-explore");
	});
});
