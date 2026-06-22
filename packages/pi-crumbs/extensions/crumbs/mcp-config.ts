import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveCrumbsBin } from "./bin-resolve.js";

export const CRUMBS_MCP_SERVER_NAME = "code_crumbs";

interface McpServerConfig {
	command?: unknown;
	args?: unknown;
	directTools?: unknown;
}

interface McpConfig {
	mcpServers?: Record<string, McpServerConfig>;
}

function piHome(): string {
	return process.env.PI_OPENSPEC_TEST_HOME || homedir();
}

export function piAgentMcpPath(): string {
	return join(piHome(), ".pi", "agent", "mcp.json");
}

function readText(path: string): string {
	if (!existsSync(path)) return "";
	try {
		return readFileSync(path, "utf-8");
	} catch {
		return "";
	}
}

function hasCrumbsMcpReference(value: unknown): boolean {
	if (typeof value === "string") return /(^|[/\\])crumbs(?:\.exe)?(?:\s|$)|crumbs\s+mcp|crumbs-mcp/i.test(value);
	if (Array.isArray(value)) return value.some(hasCrumbsMcpReference);
	if (value && typeof value === "object") return Object.entries(value).some(([key, entry]) => hasCrumbsMcpReference(key) || hasCrumbsMcpReference(entry));
	return false;
}

export function hasCrumbsMcpConfig(raw: string): boolean {
	if (!raw.trim()) return false;
	try {
		const parsed = JSON.parse(raw) as McpConfig;
		return Object.entries(parsed.mcpServers ?? {}).some(([name, server]) => hasCrumbsMcpReference(name) || hasCrumbsMcpReference(server));
	} catch {
		return false;
	}
}

export interface EnsureCrumbsMcpConfigResult {
	configuredAlready: boolean;
	created: boolean;
	path: string;
	serverName?: string;
	error?: string;
}

export function ensureCrumbsMcpConfig(): EnsureCrumbsMcpConfigResult {
	const path = piAgentMcpPath();
	const raw = readText(path);
	if (hasCrumbsMcpConfig(raw)) return { configuredAlready: true, created: false, path };

	const bin = resolveCrumbsBin();
	if (!bin) return { configuredAlready: false, created: false, path, error: "crumbs binary could not be resolved on PATH (set PI_CRUMBS_BIN or install crumbs)" };

	try {
		const parsed = raw.trim() ? JSON.parse(raw) as McpConfig : {};
		const mcpServers = parsed.mcpServers && typeof parsed.mcpServers === "object" ? parsed.mcpServers : {};
		mcpServers[CRUMBS_MCP_SERVER_NAME] = {
			command: bin,
			args: ["mcp", "serve", "--transport", "stdio"],
			directTools: true,
		};
		const next: McpConfig = { ...parsed, mcpServers };
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
		return { configuredAlready: false, created: true, path, serverName: CRUMBS_MCP_SERVER_NAME };
	} catch (error) {
		return { configuredAlready: false, created: false, path, error: error instanceof Error ? error.message : String(error) };
	}
}
