import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	CODEBASE_MEMORY_BRIDGE_PACKAGE,
	EXPECTED_CODEBASE_MEMORY_TOOLS,
	findWorkflowOverlaps,
	hasCodebaseMemoryMcp,
	hasCodebaseMemoryMcpConfig,
	hasPiMcpAdapterInstalled,
} from "../extensions/openspec/package-checks.js";

describe("package-checks", () => {
	describe("codebase-memory constants", () => {
		it("keeps pi-mcp-adapter as the retained bridge package", () => {
			expect(CODEBASE_MEMORY_BRIDGE_PACKAGE).toBe("npm:pi-mcp-adapter");
			expect(EXPECTED_CODEBASE_MEMORY_TOOLS).toContain("codebase_memory_search_graph");
			expect(EXPECTED_CODEBASE_MEMORY_TOOLS).toContain("codebase_memory_get_code_snippet");
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
				expect(findWorkflowOverlaps(empty).filter((x) => x.startsWith("skill:") || x.startsWith("prompt:") || x.startsWith("generated:"))).toEqual([]);
			} finally {
				rmSync(empty, { recursive: true, force: true });
			}
		});
	});

	describe("codebase-memory detection", () => {
		it("returns booleans from Pi settings files", () => {
			expect(typeof hasCodebaseMemoryMcp()).toBe("boolean");
			expect(typeof hasPiMcpAdapterInstalled()).toBe("boolean");
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

		it("detects codebase-memory-mcp anywhere in an MCP server config", () => {
			expect(hasCodebaseMemoryMcpConfig(JSON.stringify({ mcpServers: { cbm: { command: "/opt/bin/codebase-memory-mcp" } } }))).toBe(true);
			expect(hasCodebaseMemoryMcpConfig(JSON.stringify({ mcpServers: { cbm: { command: "/opt/bin/codebase-memory-mcp", directTools: false } } }))).toBe(true);
			expect(hasCodebaseMemoryMcpConfig(JSON.stringify({ mcpServers: { cbm: { command: "npx", args: ["-y", "codebase-memory-mcp"], directTools: true } } }))).toBe(true);
			expect(hasCodebaseMemoryMcpConfig(JSON.stringify({ mcpServers: { "codebase-memory-mcp": { command: "future-wrapper" } } }))).toBe(true);
		});

		it("does not depend on MCP server name alone", () => {
			expect(hasCodebaseMemoryMcpConfig(JSON.stringify({ mcpServers: { "codebase-memory": { command: "qmd", args: ["mcp"] } } }))).toBe(false);
		});

		it("does not detect unrelated or malformed MCP config", () => {
			expect(hasCodebaseMemoryMcpConfig(JSON.stringify({ mcpServers: { other: { command: "not-codebase-memory" } } }))).toBe(false);
			expect(hasCodebaseMemoryMcpConfig("not json codebase-memory-mcp")).toBe(false);
		});
	});
});
