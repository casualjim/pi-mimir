import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT, syncBundledAgents } from "./agents.js";
import { writeOpenSpecAssetManifest } from "./managed-assets.js";
import { readMimirManagedManifest, writeMimirManagedManifest } from "./managed-manifest.js";
import {
	CODEBASE_MEMORY_BRIDGE_PACKAGE,
	EXPECTED_CODEBASE_MEMORY_TOOLS,
	ensureCodebaseMemoryMcpConfig,
} from "./package-checks.js";
import { registerOpenSpecCliOutputRenderer, sendOpenSpecCliOutput } from "./openspec-output-renderer.js";
import { syncBundledSchemas } from "./schema-sync.js";

const OPENSPEC_TIMEOUT_MS = 120_000;
const REVIEW_GATED_SCHEMA = "review-gated";

type CommandContext = {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
};

export interface EnsureReviewGatedConfigResult {
	path: string;
	created: boolean;
	updated: boolean;
}

export interface SyncBundledSkillsResult {
	added: string[];
	updated: string[];
	removed: string[];
}

export interface CodebaseMemoryBridgeResult {
	adapterAlreadyInstalled: boolean;
	adapterInstallAttempted: boolean;
	adapterInstallSucceeded: boolean;
	adapterInstallError?: string;
	codebaseMemoryMcpConfigured: boolean;
	codebaseMemoryMcpConfiguredAlready: boolean;
	codebaseMemoryMcpConfigCreated: boolean;
	codebaseMemoryMcpConfigPath: string;
	codebaseMemoryMcpConfigError?: string;
	codebaseMemoryMcpNeedsDirectTools: boolean;
}

export function ensureReviewGatedOpenSpecConfig(cwd: string): EnsureReviewGatedConfigResult {
	const openspecDir = join(cwd, "openspec");
	const configPath = join(openspecDir, "config.yaml");
	mkdirSync(openspecDir, { recursive: true });

	if (!existsSync(configPath)) {
		writeFileSync(configPath, `schema: ${REVIEW_GATED_SCHEMA}\n`, "utf-8");
		return { path: configPath, created: true, updated: true };
	}

	const original = readFileSync(configPath, "utf-8");
	const lines = original.split(/\r?\n/);
	const schemaLine = `schema: ${REVIEW_GATED_SCHEMA}`;
	const existingIndex = lines.findIndex((line) => /^schema\s*:/.test(line));

	if (existingIndex >= 0) {
		if (lines[existingIndex] === schemaLine) return { path: configPath, created: false, updated: false };
		lines[existingIndex] = schemaLine;
		writeFileSync(configPath, normalizeTrailingNewline(lines.join("\n")), "utf-8");
		return { path: configPath, created: false, updated: true };
	}

	writeFileSync(configPath, `${schemaLine}\n${original}`, "utf-8");
	return { path: configPath, created: false, updated: true };
}

export function syncBundledSkills(cwd: string): SyncBundledSkillsResult {
	const sourceDir = join(PACKAGE_ROOT, "skillseeds");
	const targetDir = join(cwd, ".pi", "skills");
	const result: SyncBundledSkillsResult = { added: [], updated: [], removed: [] };
	if (!existsSync(sourceDir)) return result;

	mkdirSync(targetDir, { recursive: true });
	const previousManifest = coerceSkillManifest(readMimirManagedManifest(cwd).skills);
	const manifest: SkillManifest = {};
	const bundledSkillNames = ["plan", "implement", "review-architecture", "review-implementation", "review-data-flow", "review-security", "review-plan", "review-tests"];
	const bundledSkillSet = new Set(bundledSkillNames);

	for (const name of bundledSkillNames) {
		const src = join(sourceDir, name);
		if (!existsSync(src)) continue;
		const dest = join(targetDir, name);
		const srcHash = merkleHashDirectory(src);
		const knownHash = previousManifest[name] ?? "";

		if (!existsSync(dest)) {
			cpSync(src, dest, { recursive: true, force: true });
			manifest[name] = srcHash;
			result.added.push(name);
			continue;
		}

		const currentHash = merkleHashDirectory(dest);
		if (currentHash === srcHash) {
			manifest[name] = srcHash;
			continue;
		}

		if (knownHash !== "" && currentHash === knownHash) {
			cpSync(src, dest, { recursive: true, force: true });
			manifest[name] = srcHash;
			result.updated.push(name);
		}
		// Locally edited bundled skills are left on disk and removed from the manifest;
		// they are now user-owned rather than managed drift.
	}

	for (const [name, knownHash] of Object.entries(previousManifest)) {
		if (bundledSkillSet.has(name)) continue;
		const dest = join(targetDir, name);
		if (!isSafeSkillName(name) || !existsSync(dest)) {
			result.removed.push(name);
			continue;
		}

		const currentHash = merkleHashDirectory(dest);
		if (knownHash !== "" && currentHash === knownHash) {
			rmSync(dest, { recursive: true, force: true });
			result.removed.push(name);
		}
		// Locally edited stale skills are left on disk and removed from the manifest;
		// they are now user-owned rather than managed drift.
	}

	writeSkillManifest(cwd, manifest);
	return result;
}

function sha256(parts: Array<Buffer | string>): string {
	const hash = createHash("sha256");
	for (const part of parts) hash.update(part);
	return hash.digest("hex");
}

type SkillManifest = Record<string, string>;

function isSafeSkillName(name: string): boolean {
	return name.length > 0 && !name.includes("\0") && !name.includes("/") && !name.includes("\\") && name !== "." && name !== ".." && !name.includes("..");
}

function coerceSkillManifest(value: unknown): SkillManifest {
	const manifest: SkillManifest = {};
	if (value && typeof value === "object" && !Array.isArray(value)) {
		for (const [name, hash] of Object.entries(value as Record<string, unknown>)) {
			if (typeof name === "string" && isSafeSkillName(name) && typeof hash === "string") manifest[name] = hash;
		}
	}
	return manifest;
}

function merkleHashDirectory(dir: string): string {
	return merkleHashNode(dir);
}

function merkleHashNode(path: string): string {
	const entries = readdirSync(path, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() || entry.isFile())
		.sort((a, b) => a.name.localeCompare(b.name));
	const parts: Array<Buffer | string> = ["dir\0"];
	for (const entry of entries) {
		const childPath = join(path, entry.name);
		const childHash = entry.isDirectory()
			? merkleHashNode(childPath)
			: sha256(["file\0", readFileSync(childPath)]);
		parts.push(entry.name, "\0", childHash, "\0");
	}
	return sha256(parts);
}

function writeSkillManifest(cwd: string, manifest: SkillManifest): void {
	const root = readMimirManagedManifest(cwd);
	const ordered: SkillManifest = {};
	for (const skill of Object.keys(manifest).sort()) ordered[skill] = manifest[skill] ?? "";
	root.skills = ordered;
	writeMimirManagedManifest(cwd, root);
}

export function registerOpenSpecCommands(pi: ExtensionAPI): void {
	registerOpenSpecCliOutputRenderer(pi);

	pi.registerCommand("openspec:init", {
		description: "Initialize OpenSpec for Pi and configure the review-gated workflow schema/assets",
		handler: async (_args, ctx: CommandContext) => {
			const init = await pi.exec("openspec", ["init", "--tools", "pi"], { cwd: ctx.cwd, timeout: OPENSPEC_TIMEOUT_MS });
			if (init.code !== 0) {
				notify(ctx, formatExecFailure("openspec init --tools pi", init), "error");
				return;
			}

			const config = ensureReviewGatedOpenSpecConfig(ctx.cwd);
			const schemas = syncBundledSchemas();
			const skills = syncBundledSkills(ctx.cwd);
			const agents = syncBundledAgents(ctx.cwd);
			writeOpenSpecAssetManifest(ctx.cwd);
			const codebaseMemory = await ensureCodebaseMemoryBridge(pi);

			notify(ctx, buildInitReport(config, skills, agents, schemas, codebaseMemory), initReportLevel(schemas, agents, codebaseMemory));
		},
	});

	pi.registerCommand("openspec:status", {
		description: "Show the OpenSpec interactive dashboard",
		handler: async (_args, ctx: CommandContext) => {
			await runOpenSpecCli(pi, ctx, "openspec view", ["view"]);
		},
	});

	pi.registerCommand("openspec:list", {
		description: "List OpenSpec changes and specs",
		handler: async (_args, ctx: CommandContext) => {
			await runOpenSpecCli(pi, ctx, "openspec list", ["list"]);
		},
	});
}

export async function ensureCodebaseMemoryBridge(_pi: ExtensionAPI): Promise<CodebaseMemoryBridgeResult> {
	const mcpConfig = ensureCodebaseMemoryMcpConfig();
	return {
		adapterAlreadyInstalled: true,
		adapterInstallAttempted: false,
		adapterInstallSucceeded: true,
		codebaseMemoryMcpConfigured: mcpConfig.configuredAlready || mcpConfig.created,
		codebaseMemoryMcpConfiguredAlready: mcpConfig.configuredAlready,
		codebaseMemoryMcpConfigCreated: mcpConfig.created,
		codebaseMemoryMcpConfigPath: mcpConfig.path,
		codebaseMemoryMcpConfigError: mcpConfig.error,
		codebaseMemoryMcpNeedsDirectTools: false,
	};
}

async function runOpenSpecCli(pi: ExtensionAPI, ctx: CommandContext, label: string, args: string[]): Promise<void> {
	const result = await pi.exec("openspec", args, { cwd: ctx.cwd, timeout: OPENSPEC_TIMEOUT_MS });
	const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
	const fallback = result.code === 0 ? `${label} completed.` : `${label} failed with exit ${result.code}.`;
	sendOpenSpecCliOutput(pi, {
		label,
		command: `openspec ${args.join(" ")}`,
		exitCode: result.code,
		stdout: result.stdout,
		stderr: result.stderr,
	}, output || fallback);
}

function buildInitReport(
	config: EnsureReviewGatedConfigResult,
	skills: SyncBundledSkillsResult,
	agents: ReturnType<typeof syncBundledAgents>,
	schemas: ReturnType<typeof syncBundledSchemas>,
	codebaseMemory: CodebaseMemoryBridgeResult,
): string {
	const lines = ["OpenSpec initialized for Pi review-gated workflow."];
	lines.push(config.updated ? `Configured openspec/config.yaml with schema: ${REVIEW_GATED_SCHEMA}.` : "openspec/config.yaml already uses schema: review-gated.");
	lines.push(`Synced bundled schemas: ${summary(schemas)}.`);
	lines.push(`Synced skills: ${countSummary(skills.added.length, skills.updated.length, skills.removed.length)}.`);
	lines.push(`Synced agents: ${countSummary(agents.added.length, agents.updated.length, agents.removed.length)}.`);

	if (schemas.errors.length > 0) lines.push(`Schema sync errors: ${schemas.errors.map((e) => e.message).join("; ")}`);
	if (agents.errors.length > 0) lines.push(`Agent sync errors: ${agents.errors.map((e) => e.message).join("; ")}`);
	lines.push(`pi-mcp-adapter bridge: ${codebaseMemoryBridgeSummary(codebaseMemory)}.`);
	if (codebaseMemory.codebaseMemoryMcpConfigured) {
		lines.push(codebaseMemory.codebaseMemoryMcpConfigCreated
			? `codebase-memory MCP configured in ${codebaseMemory.codebaseMemoryMcpConfigPath}. Restart/reload Pi if the new MCP server is not active yet.`
			: `Existing codebase-memory MCP configuration preserved. Expected tools: ${EXPECTED_CODEBASE_MEMORY_TOOLS.join(", ")}.`);
		if (codebaseMemory.codebaseMemoryMcpNeedsDirectTools) lines.push("NOTE: codebase-memory MCP is configured without directTools: true; it can still work through MCP, but direct codebase_memory_* tools may not be exposed.");
	} else {
		lines.push(
			`WARNING: codebase-memory MCP is required for full pi-mimir architecture-memory-first discovery but could not be configured automatically${codebaseMemory.codebaseMemoryMcpConfigError ? `: ${codebaseMemory.codebaseMemoryMcpConfigError}` : ""}. Verify MCP config at ${codebaseMemory.codebaseMemoryMcpConfigPath}. Exact file reads are degraded fallback only.`,
		);
	}
	return lines.join("\n");
}

function initReportLevel(
	schemas: ReturnType<typeof syncBundledSchemas>,
	agents: ReturnType<typeof syncBundledAgents>,
	codebaseMemory: CodebaseMemoryBridgeResult,
): "info" | "warning" {
	return schemas.errors.length > 0 || agents.errors.length > 0 || !codebaseMemory.adapterInstallSucceeded || !codebaseMemory.codebaseMemoryMcpConfigured ? "warning" : "info";
}

function codebaseMemoryBridgeSummary(_result: CodebaseMemoryBridgeResult): string {
	return `${CODEBASE_MEMORY_BRIDGE_PACKAGE} compatibility retained; codebase-memory-mcp configured directly when missing`;
}

function summary(result: ReturnType<typeof syncBundledSchemas>): string {
	return countSummary(result.added.length, result.updated.length, result.removed.length);
}

function countSummary(added: number, updated: number, removed = 0): string {
	const parts: string[] = [];
	if (added > 0) parts.push(`${added} added`);
	if (updated > 0) parts.push(`${updated} updated`);
	if (removed > 0) parts.push(`${removed} removed`);
	return parts.length > 0 ? parts.join(", ") : "up-to-date";
}

function formatExecFailure(label: string, result: { code: number; stdout?: string; stderr?: string }): string {
	const detail = (result.stderr || result.stdout || "").trim();
	return detail ? `${label} failed: ${detail}` : `${label} failed with exit ${result.code}.`;
}

function notify(ctx: CommandContext, message: string, level: "info" | "warning" | "error"): void {
	if (ctx.hasUI && ctx.ui) ctx.ui.notify(message, level);
}

function normalizeTrailingNewline(content: string): string {
	return content.endsWith("\n") ? content : `${content}\n`;
}
