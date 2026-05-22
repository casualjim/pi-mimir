/**
 * pi-mimir readiness checks.
 *
 * Keeps codebase-memory MCP detection and workflow overlap warnings without the
 * retired rpiv sibling setup registry.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CODEBASE_MEMORY_BRIDGE_PACKAGE = "npm:pi-mcp-adapter";
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

const GENERIC_OVERLAP_SKILLS = ["research", "design", "blueprint", "validate", "review", "commit"] as const;
const COMPETING_GENERATED_OPENSPEC_SKILLS = ["openspec-propose"] as const;

export function findWorkflowOverlaps(cwd?: string): string[] {
	const installed = readInstalledPackages();
	const findings = new Set<string>();
	for (const entry of installed) {
		if (/@juicesharp\/rpiv-pi|rpiv-pi/i.test(entry)) findings.add("package:@juicesharp/rpiv-pi");
		if (/pi-superpowers|superpowers/i.test(entry)) findings.add("package:pi-superpowers");
	}
	if (cwd) {
		for (const name of GENERIC_OVERLAP_SKILLS) {
			if (existsSync(join(cwd, ".pi", "skills", name, "SKILL.md"))) findings.add(`skill:${name}`);
			if (existsSync(join(cwd, ".pi", "prompts", `${name}.md`))) findings.add(`prompt:${name}`);
		}
		for (const name of COMPETING_GENERATED_OPENSPEC_SKILLS) {
			if (existsSync(join(cwd, ".pi", "skills", name, "SKILL.md"))) findings.add(`generated:${name}`);
		}
		if (existsSync(join(cwd, ".pi", "skills", "opsx", "SKILL.md"))) findings.add("generated:/opsx");
	}
	return [...findings].sort();
}
