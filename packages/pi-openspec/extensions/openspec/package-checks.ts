/**
 * Detect which SIBLINGS are installed by reading ~/.pi/agent/settings.json.
 * Pure utility — no ExtensionAPI.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SIBLINGS, type SiblingPlugin } from "./siblings.js";

const PI_AGENT_SETTINGS = join(homedir(), ".pi", "agent", "settings.json");
const PI_AGENT_MCP = join(homedir(), ".pi", "agent", "mcp.json");

function readSettingsText(): string {
	if (!existsSync(PI_AGENT_SETTINGS)) return "";
	try {
		return readFileSync(PI_AGENT_SETTINGS, "utf-8");
	} catch {
		return "";
	}
}

function readInstalledPackages(): string[] {
	const raw = readSettingsText();
	if (!raw) return [];
	try {
		const settings = JSON.parse(raw) as { packages?: unknown };
		if (!Array.isArray(settings.packages)) return [];
		return settings.packages.filter((e): e is string => typeof e === "string");
	} catch {
		return [];
	}
}

/**
 * Return the SIBLINGS not currently installed.
 * Reads ~/.pi/agent/settings.json once per call.
 */
export function findMissingSiblings(): SiblingPlugin[] {
	const installed = readInstalledPackages();
	return SIBLINGS.filter((s) => !installed.some((entry) => s.matches.test(entry)));
}

function readMcpText(): string {
	if (!existsSync(PI_AGENT_MCP)) return "";
	try {
		return readFileSync(PI_AGENT_MCP, "utf-8");
	} catch {
		return "";
	}
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
	if (!raw.trim()) return false;
	try {
		const parsed = JSON.parse(raw) as McpConfig;
		return Object.values(parsed.mcpServers ?? {}).some(
			(server) => typeof server.command === "string" && /(?:^|[/\\])codebase-memory-mcp(?:$|[.\s-])/i.test(server.command),
		);
	} catch {
		return false;
	}
}

export function hasCodebaseMemoryMcp(): boolean {
	return hasCodebaseMemoryMcpConfig(readMcpText());
}

const GENERIC_OVERLAP_SKILLS = [
	"research",
	"design",
	"blueprint",
	"validate",
	"review",
	"commit",
] as const;

const COMPETING_GENERATED_OPENSPEC_SKILLS = [
	"openspec-propose",
] as const;

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
