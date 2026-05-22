/**
 * pi-mimir readiness checks.
 *
 * Keeps codebase-memory MCP detection and workflow overlap warnings without the
 * retired rpiv sibling setup registry.
 */

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export const CODEBASE_MEMORY_BRIDGE_PACKAGE = "npm:pi-mcp-adapter";
export const CODEBASE_MEMORY_MCP_SERVER_NAME = "codebase-memory-mcp";
export const EXPECTED_CODEBASE_MEMORY_TOOLS = [
	"codebase_memory_get_architecture",
	"codebase_memory_search_graph",
	"codebase_memory_search_code",
	"codebase_memory_trace_path",
	"codebase_memory_get_code_snippet",
] as const;

function piHome(): string {
	return process.env.PI_OPENSPEC_TEST_HOME || homedir();
}

function piAgentSettingsPath(): string {
	return join(piHome(), ".pi", "agent", "settings.json");
}

function piAgentMcpPath(): string {
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

function readInstalledPackages(): string[] {
	const raw = readText(piAgentSettingsPath());
	if (!raw) return [];
	try {
		const settings = JSON.parse(raw) as { packages?: unknown };
		return Array.isArray(settings.packages) ? settings.packages.filter((entry): entry is string => typeof entry === "string") : [];
	} catch {
		return [];
	}
}

export function hasPiMcpAdapterInstalled(): boolean {
	return readInstalledPackages().some((entry) => /(?:^|npm:)pi-mcp-adapter(?:@|$)/i.test(entry));
}

interface McpServerConfig {
	command?: unknown;
	args?: unknown;
	directTools?: unknown;
}

interface McpConfig {
	mcpServers?: Record<string, McpServerConfig>;
}

export function hasCodebaseMemoryMcpConfig(raw: string): boolean {
	return getCodebaseMemoryMcpConfigStatus(raw).configured;
}

export function codebaseMemoryMcpNeedsDirectToolsConfig(raw: string): boolean {
	return getCodebaseMemoryMcpConfigStatus(raw).needsDirectTools;
}

export function getCodebaseMemoryMcpConfigStatus(raw: string): { configured: boolean; directTools: boolean; needsDirectTools: boolean } {
	if (!raw.trim()) return { configured: false, directTools: false, needsDirectTools: false };
	try {
		const parsed = JSON.parse(raw) as McpConfig;
		const servers = Object.entries(parsed.mcpServers ?? {}).filter(([name, server]) => hasCodebaseMemoryMcpReference(name) || hasCodebaseMemoryMcpReference(server));
		const directTools = servers.some(([, server]) => server.directTools === true);
		return { configured: servers.length > 0, directTools, needsDirectTools: servers.length > 0 && !directTools };
	} catch {
		return { configured: false, directTools: false, needsDirectTools: false };
	}
}

function hasCodebaseMemoryMcpReference(value: unknown): boolean {
	if (typeof value === "string") return /codebase-memory-mcp/i.test(value);
	if (Array.isArray(value)) return value.some(hasCodebaseMemoryMcpReference);
	if (value && typeof value === "object") return Object.entries(value).some(([key, entry]) => hasCodebaseMemoryMcpReference(key) || hasCodebaseMemoryMcpReference(entry));
	return false;
}

export function hasCodebaseMemoryMcp(): boolean {
	return hasCodebaseMemoryMcpConfig(readText(piAgentMcpPath()));
}

export function codebaseMemoryMcpNeedsDirectTools(): boolean {
	return codebaseMemoryMcpNeedsDirectToolsConfig(readText(piAgentMcpPath()));
}

export interface EnsureCodebaseMemoryMcpConfigResult {
	configuredAlready: boolean;
	created: boolean;
	path: string;
	serverName?: string;
	error?: string;
}

export function resolveBundledCodebaseMemoryMcpBin(): string | undefined {
	try {
		return require.resolve("codebase-memory-mcp/bin.js");
	} catch {
		return undefined;
	}
}

export function ensureCodebaseMemoryMcpConfig(): EnsureCodebaseMemoryMcpConfigResult {
	const path = piAgentMcpPath();
	const raw = readText(path);
	if (hasCodebaseMemoryMcpConfig(raw)) return { configuredAlready: true, created: false, path };

	const bin = resolveBundledCodebaseMemoryMcpBin();
	if (!bin) return { configuredAlready: false, created: false, path, error: "Bundled codebase-memory-mcp binary could not be resolved" };

	try {
		const parsed = raw.trim() ? JSON.parse(raw) as McpConfig : {};
		const mcpServers = parsed.mcpServers && typeof parsed.mcpServers === "object" ? parsed.mcpServers : {};
		mcpServers[CODEBASE_MEMORY_MCP_SERVER_NAME] = {
			command: process.execPath,
			args: [bin],
			directTools: true,
		};
		const next: McpConfig = { ...parsed, mcpServers };
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
		return { configuredAlready: false, created: true, path, serverName: CODEBASE_MEMORY_MCP_SERVER_NAME };
	} catch (error) {
		return { configuredAlready: false, created: false, path, error: error instanceof Error ? error.message : String(error) };
	}
}

export function findWorkflowOverlaps(_cwd?: string): string[] {
	const installed = readInstalledPackages();
	const findings = new Set<string>();
	for (const entry of installed) {
		if (/@juicesharp\/rpiv-pi|rpiv-pi/i.test(entry)) findings.add("package:@juicesharp/rpiv-pi");
		if (/pi-superpowers|superpowers/i.test(entry)) findings.add("package:pi-superpowers");
	}
	return [...findings].sort();
}
