/**
 * pi-mimir readiness checks.
 *
 * Keeps workflow overlap warnings and checks whether the external
 * pi-codebase-memory plugin is installed and active.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CODEBASE_MEMORY_PLUGIN_PACKAGE = "@casualjim/pi-codebase-memory";
export const CODEBASE_MEMORY_INSTALL_COMMAND = `pi install ${CODEBASE_MEMORY_PLUGIN_PACKAGE}`;
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

export function hasPiCodebaseMemoryInstalled(): boolean {
	return readInstalledPackages().some((entry) => new RegExp(`(?:^|npm:)${CODEBASE_MEMORY_PLUGIN_PACKAGE.replace("/", "\\/")}(?:@|$)`, "i").test(entry));
}

export interface CodebaseMemoryToolStatus {
	toolsAvailable: boolean;
	missingTools: string[];
}

export interface CodebaseMemorySupportStatus extends CodebaseMemoryToolStatus {
	packageInstalled: boolean;
	installCommand: string;
}

export function getCodebaseMemoryToolStatus(pi: { getAllTools?: (() => unknown[]) | undefined }): CodebaseMemoryToolStatus {
	const tools = typeof pi.getAllTools === "function" ? pi.getAllTools() : [];
	const toolNames = new Set(
		Array.isArray(tools)
			? tools.map((tool) => {
				if (tool && typeof tool === "object" && "name" in tool && typeof (tool as { name?: unknown }).name === "string") return (tool as { name: string }).name;
				return typeof tool === "string" ? tool : "";
			}).filter(Boolean)
			: [],
	);
	const missingTools = EXPECTED_CODEBASE_MEMORY_TOOLS.filter((name) => !toolNames.has(name));
	return {
		toolsAvailable: missingTools.length === 0,
		missingTools,
	};
}

export function getCodebaseMemorySupportStatus(pi: { getAllTools?: (() => unknown[]) | undefined }): CodebaseMemorySupportStatus {
	const toolStatus = getCodebaseMemoryToolStatus(pi);
	return {
		packageInstalled: hasPiCodebaseMemoryInstalled(),
		installCommand: CODEBASE_MEMORY_INSTALL_COMMAND,
		...toolStatus,
	};
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
