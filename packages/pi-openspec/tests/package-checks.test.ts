import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	findMissingSiblings,
	findWorkflowOverlaps,
	hasCodebaseMemoryMcp,
	hasCodebaseMemoryMcpConfig,
} from "../extensions/openspec/package-checks.js";
import { SIBLINGS } from "../extensions/openspec/siblings.js";

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

	describe("workflow overlap detection", () => {
		let cwd: string;

		beforeEach(() => {
			cwd = join(tmpdir(), `openspec-overlap-test-${Date.now()}`);
			mkdirSync(join(cwd, ".pi", "skills", "blueprint"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "skills", "blueprint", "SKILL.md"), "# blueprint");
		});

		afterEach(() => {
			rmSync(cwd, { recursive: true, force: true });
		});

		it("detects generic overlapping skills", () => {
			expect(findWorkflowOverlaps(cwd)).toContain("skill:blueprint");
		});

		it("does not treat package-owned plan/implement names as generic overlaps", () => {
			mkdirSync(join(cwd, ".pi", "skills", "plan"), { recursive: true });
			mkdirSync(join(cwd, ".pi", "skills", "implement"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"), "# plan");
			writeFileSync(join(cwd, ".pi", "skills", "implement", "SKILL.md"), "# implement");
			expect(findWorkflowOverlaps(cwd)).not.toContain("skill:plan");
			expect(findWorkflowOverlaps(cwd)).not.toContain("skill:implement");
		});

		it("detects competing generated OpenSpec propose skills as explicit coexistence warnings", () => {
			mkdirSync(join(cwd, ".pi", "skills", "openspec-propose"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "skills", "openspec-propose", "SKILL.md"), "# openspec-propose");
			expect(findWorkflowOverlaps(cwd)).toContain("generated:openspec-propose");
		});

		it("does not warn for generated apply helpers used by implement", () => {
			mkdirSync(join(cwd, ".pi", "skills", "openspec-apply-change"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "skills", "openspec-apply-change", "SKILL.md"), "# openspec-apply-change");
			expect(findWorkflowOverlaps(cwd)).not.toContain("generated:openspec-apply-change");
		});

		it("detects broad prompt overlaps", () => {
			mkdirSync(join(cwd, ".pi", "prompts"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "prompts", "review.md"), "# review");
			expect(findWorkflowOverlaps(cwd)).toContain("prompt:review");
		});

		it("does not report generic overlap for an empty project", () => {
			const empty = join(tmpdir(), `openspec-no-overlap-test-${Date.now()}`);
			mkdirSync(empty, { recursive: true });
			try {
				expect(
					findWorkflowOverlaps(empty).filter(
						(x) => x.startsWith("skill:") || x.startsWith("prompt:") || x.startsWith("generated:"),
					),
				).toEqual([]);
			} finally {
				rmSync(empty, { recursive: true, force: true });
			}
		});
	});

	describe("codebase-memory detection", () => {
		it("returns a boolean from ~/.pi/agent/mcp.json", () => {
			expect(typeof hasCodebaseMemoryMcp()).toBe("boolean");
		});

		it("detects codebase-memory MCP config by command path", () => {
			expect(
				hasCodebaseMemoryMcpConfig(
					JSON.stringify({
						mcpServers: {
							anyName: {
								command: "/Users/ivan/github/DeusData/codebase-memory-mcp/build/c/codebase-memory-mcp",
								args: [],
								directTools: true,
							},
						},
					}),
				),
			).toBe(true);
		});

		it("does not depend on MCP server name", () => {
			expect(hasCodebaseMemoryMcpConfig(JSON.stringify({ mcpServers: { "codebase-memory": { command: "qmd", args: ["mcp"] } } }))).toBe(false);
		});

		it("does not detect unrelated or malformed MCP config", () => {
			expect(hasCodebaseMemoryMcpConfig(JSON.stringify({ mcpServers: { other: { command: "not-codebase-memory" } } }))).toBe(false);
			expect(hasCodebaseMemoryMcpConfig("not json codebase-memory-mcp")).toBe(false);
		});
	});
});
