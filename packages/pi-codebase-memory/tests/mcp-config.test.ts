import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureCodebaseMemoryMcpConfig, hasCodebaseMemoryMcpConfig } from "../extensions/codebase-memory/mcp-config.js";

describe("mcp-config", () => {
	it("detects codebase-memory MCP config", () => {
		expect(hasCodebaseMemoryMcpConfig(JSON.stringify({ mcpServers: { cbm: { command: "/opt/bin/codebase-memory-mcp" } } }))).toBe(true);
		expect(hasCodebaseMemoryMcpConfig(JSON.stringify({ mcpServers: { other: { command: "qmd" } } }))).toBe(false);
	});

	it("creates a default codebase-memory-mcp server when missing", () => {
		const home = join(tmpdir(), `codebase-memory-mcp-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

	it("does not overwrite malformed MCP config", () => {
		const home = join(tmpdir(), `codebase-memory-mcp-malformed-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
		process.env.PI_OPENSPEC_TEST_HOME = home;
		const mcpPath = join(home, ".pi", "agent", "mcp.json");
		mkdirSync(join(home, ".pi", "agent"), { recursive: true });
		writeFileSync(mcpPath, "{ not json", "utf-8");
		try {
			const result = ensureCodebaseMemoryMcpConfig();
			expect(result.created).toBe(false);
			expect(result.error).toBeTruthy();
			expect(readFileSync(mcpPath, "utf-8")).toBe("{ not json");
		} finally {
			if (oldHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
			else process.env.PI_OPENSPEC_TEST_HOME = oldHome;
			rmSync(home, { recursive: true, force: true });
		}
	});
});
