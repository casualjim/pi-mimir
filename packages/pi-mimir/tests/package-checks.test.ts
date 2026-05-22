import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	CODEBASE_MEMORY_BRIDGE_PACKAGE,
	EXPECTED_CODEBASE_MEMORY_TOOLS,
	ensureCodebaseMemoryMcpConfig,
	findWorkflowOverlaps,
	hasCodebaseMemoryMcp,
	hasCodebaseMemoryMcpConfig,
	hasPiMcpAdapterInstalled,
} from "../extensions/openspec/package-checks.js";

describe("package-checks", () => {
	describe("codebase-memory constants", () => {
		it("keeps pi-mcp-adapter compatibility while expecting codebase-memory tools", () => {
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

		it("does not treat workflow skill names as overlaps", () => {
			expect(findWorkflowOverlaps(cwd)).not.toContain("skill:blueprint");
			mkdirSync(join(cwd, ".pi", "skills", "plan"), { recursive: true });
			mkdirSync(join(cwd, ".pi", "skills", "implement"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "skills", "plan", "SKILL.md"), "# plan");
			writeFileSync(join(cwd, ".pi", "skills", "implement", "SKILL.md"), "# implement");
			expect(findWorkflowOverlaps(cwd)).not.toContain("skill:plan");
			expect(findWorkflowOverlaps(cwd)).not.toContain("skill:implement");
		});

		it("does not warn for generated OpenSpec propose/apply helpers", () => {
			mkdirSync(join(cwd, ".pi", "skills", "openspec-propose"), { recursive: true });
			mkdirSync(join(cwd, ".pi", "skills", "openspec-apply-change"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "skills", "openspec-propose", "SKILL.md"), "# openspec-propose");
			writeFileSync(join(cwd, ".pi", "skills", "openspec-apply-change", "SKILL.md"), "# openspec-apply-change");
			expect(findWorkflowOverlaps(cwd)).not.toContain("generated:openspec-propose");
			expect(findWorkflowOverlaps(cwd)).not.toContain("generated:openspec-apply-change");
		});

		it("does not treat prompt names as overlaps", () => {
			mkdirSync(join(cwd, ".pi", "prompts"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "prompts", "review.md"), "# review");
			expect(findWorkflowOverlaps(cwd)).not.toContain("prompt:review");
		});

		it("detects known plugin packages", () => {
			const home = join(tmpdir(), `openspec-package-overlap-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
			const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
			process.env.PI_OPENSPEC_TEST_HOME = home;
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(join(home, ".pi", "agent", "settings.json"), JSON.stringify({ packages: ["npm:@juicesharp/rpiv-pi", "npm:pi-superpowers"] }), "utf-8");
			try {
				expect(findWorkflowOverlaps(cwd)).toEqual(["package:@juicesharp/rpiv-pi", "package:pi-superpowers"]);
			} finally {
				if (oldHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
				else process.env.PI_OPENSPEC_TEST_HOME = oldHome;
				rmSync(home, { recursive: true, force: true });
			}
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

		it("creates a default codebase-memory-mcp server when missing", () => {
			const home = join(tmpdir(), `openspec-mcp-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
			const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
			process.env.PI_OPENSPEC_TEST_HOME = home;
			try {
				const result = ensureCodebaseMemoryMcpConfig();
				expect(result.created).toBe(true);
				expect(result.configuredAlready).toBe(false);
				const parsed = JSON.parse(readFileSync(join(home, ".pi", "agent", "mcp.json"), "utf-8"));
				expect(parsed.mcpServers["codebase-memory-mcp"].command).toBe(process.execPath);
				expect(parsed.mcpServers["codebase-memory-mcp"].args[0]).toContain("codebase-memory-mcp");
				expect(parsed.mcpServers["codebase-memory-mcp"].directTools).toBe(true);
			} finally {
				if (oldHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
				else process.env.PI_OPENSPEC_TEST_HOME = oldHome;
				rmSync(home, { recursive: true, force: true });
			}
		});

		it("preserves an existing codebase-memory-mcp server", () => {
			const home = join(tmpdir(), `openspec-mcp-existing-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
			const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
			process.env.PI_OPENSPEC_TEST_HOME = home;
			const mcpPath = join(home, ".pi", "agent", "mcp.json");
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			const existing = { mcpServers: { custom: { command: "/opt/bin/codebase-memory-mcp", args: ["--custom"], directTools: false } } };
			writeFileSync(mcpPath, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
			try {
				const result = ensureCodebaseMemoryMcpConfig();
				expect(result.configuredAlready).toBe(true);
				expect(result.created).toBe(false);
				expect(JSON.parse(readFileSync(mcpPath, "utf-8"))).toEqual(existing);
			} finally {
				if (oldHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
				else process.env.PI_OPENSPEC_TEST_HOME = oldHome;
				rmSync(home, { recursive: true, force: true });
			}
		});
	});
});
