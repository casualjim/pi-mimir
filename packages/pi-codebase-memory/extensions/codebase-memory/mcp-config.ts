import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export const CODEBASE_MEMORY_MCP_SERVER_NAME = "codebase-memory-mcp";

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

function hasCodebaseMemoryMcpReference(value: unknown): boolean {
	if (typeof value === "string") return /codebase-memory-mcp/i.test(value);
	if (Array.isArray(value)) return value.some(hasCodebaseMemoryMcpReference);
	if (value && typeof value === "object") return Object.entries(value).some(([key, entry]) => hasCodebaseMemoryMcpReference(key) || hasCodebaseMemoryMcpReference(entry));
	return false;
}

export function hasCodebaseMemoryMcpConfig(raw: string): boolean {
	if (!raw.trim()) return false;
	try {
		const parsed = JSON.parse(raw) as McpConfig;
		return Object.entries(parsed.mcpServers ?? {}).some(([name, server]) => hasCodebaseMemoryMcpReference(name) || hasCodebaseMemoryMcpReference(server));
	} catch {
		return false;
	}
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
