import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureCrumbsMcpConfig, hasCrumbsMcpConfig } from "../extensions/crumbs/mcp-config.js";
import { resetCrumbsBinCache } from "../extensions/crumbs/bin-resolve.js";

describe("mcp-config", () => {
	it("detects crumbs MCP config", () => {
		expect(hasCrumbsMcpConfig(JSON.stringify({ mcpServers: { crumbs: { command: "/opt/bin/crumbs" } } }))).toBe(true);
		expect(hasCrumbsMcpConfig(JSON.stringify({ mcpServers: { other: { command: "qmd" } } }))).toBe(false);
	});

	it("creates a default crumbs MCP server when missing", () => {
		const home = join(tmpdir(), `crumbs-mcp-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
		const oldBin = process.env.PI_CRUMBS_BIN;
		const fakeBin = join(home, "fake-crumbs");
		mkdirSync(home, { recursive: true });
		writeFileSync(fakeBin, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
		process.env.PI_OPENSPEC_TEST_HOME = home;
		process.env.PI_CRUMBS_BIN = fakeBin;
		resetCrumbsBinCache();
		try {
			const result = ensureCrumbsMcpConfig();
			expect(result.created).toBe(true);
			expect(result.configuredAlready).toBe(false);
			const parsed = JSON.parse(readFileSync(join(home, ".pi", "agent", "mcp.json"), "utf-8"));
			expect(parsed.mcpServers["code_crumbs"].command).toBe(fakeBin);
			expect(parsed.mcpServers["code_crumbs"].args).toEqual(["mcp", "serve", "--transport", "stdio"]);
			expect(parsed.mcpServers["code_crumbs"].directTools).toBe(true);
		} finally {
			if (oldHome === undefined) delete process.env.PI_OPENSPEC_TEST_HOME;
			else process.env.PI_OPENSPEC_TEST_HOME = oldHome;
			if (oldBin === undefined) delete process.env.PI_CRUMBS_BIN;
			else process.env.PI_CRUMBS_BIN = oldBin;
			resetCrumbsBinCache();
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("does not overwrite malformed MCP config", () => {
		const home = join(tmpdir(), `crumbs-mcp-malformed-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		const oldHome = process.env.PI_OPENSPEC_TEST_HOME;
		process.env.PI_OPENSPEC_TEST_HOME = home;
		const mcpPath = join(home, ".pi", "agent", "mcp.json");
		mkdirSync(join(home, ".pi", "agent"), { recursive: true });
		writeFileSync(mcpPath, "{ not json", "utf-8");
		try {
			const result = ensureCrumbsMcpConfig();
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
