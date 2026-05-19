import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT, syncBundledAgents } from "./agents.js";
import { writeOpenSpecAssetManifest } from "./managed-assets.js";
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
	const sourceDir = join(PACKAGE_ROOT, "skills");
	const targetDir = join(cwd, ".pi", "skills");
	const result: SyncBundledSkillsResult = { added: [], updated: [] };
	if (!existsSync(sourceDir)) return result;

	mkdirSync(targetDir, { recursive: true });
	for (const name of ["plan", "implement", "review-design", "review-implementation", "review-proposal", "review-specs", "review-tasks"]) {
		const src = join(sourceDir, name);
		if (!existsSync(src)) continue;
		const dest = join(targetDir, name);
		const existed = existsSync(dest);
		cpSync(src, dest, { recursive: true, force: true });
		(existed ? result.updated : result.added).push(name);
	}
	return result;
}

export function registerOpenSpecCommands(pi: ExtensionAPI): void {
	pi.registerCommand("openspec:init", {
		description: "Initialize OpenSpec for Pi and configure the review-gated workflow schema/assets",
		handler: async (_args, ctx: CommandContext) => {
			const init = await pi.exec("openspec", ["init", "--tools", "pi"], { cwd: ctx.cwd, timeout: OPENSPEC_TIMEOUT_MS });
			if (init.code !== 0) {
				notify(ctx, formatExecFailure("openspec init --tools pi", init), "error");
				return;
			}

			const config = ensureReviewGatedOpenSpecConfig(ctx.cwd);
			const schemas = syncBundledSchemas(false);
			const skills = syncBundledSkills(ctx.cwd);
			const agents = syncBundledAgents(ctx.cwd, true);
			writeOpenSpecAssetManifest(ctx.cwd);

			notify(ctx, buildInitReport(config, skills, agents, schemas), schemas.errors.length > 0 || agents.errors.length > 0 ? "warning" : "info");
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

async function runOpenSpecCli(pi: ExtensionAPI, ctx: CommandContext, label: string, args: string[]): Promise<void> {
	const result = await pi.exec("openspec", args, { cwd: ctx.cwd, timeout: OPENSPEC_TIMEOUT_MS });
	const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
	if (result.code === 0) notify(ctx, output || `${label} completed.`, "info");
	else notify(ctx, output || `${label} failed with exit ${result.code}.`, "error");
}

function buildInitReport(
	config: EnsureReviewGatedConfigResult,
	skills: SyncBundledSkillsResult,
	agents: ReturnType<typeof syncBundledAgents>,
	schemas: ReturnType<typeof syncBundledSchemas>,
): string {
	const lines = ["OpenSpec initialized for Pi review-gated workflow."];
	lines.push(config.updated ? `Configured openspec/config.yaml with schema: ${REVIEW_GATED_SCHEMA}.` : "openspec/config.yaml already uses schema: review-gated.");
	lines.push(`Synced bundled schemas: ${summary(schemas)}.`);
	lines.push(`Synced skills: ${countSummary(skills.added.length, skills.updated.length)}.`);
	lines.push(`Synced agents: ${countSummary(agents.added.length, agents.updated.length, agents.removed.length)}.`);
	if (schemas.pendingUpdate.length > 0 || schemas.pendingRemove.length > 0) lines.push("Some schema files have local edits and were left untouched.");
	if (schemas.errors.length > 0) lines.push(`Schema sync errors: ${schemas.errors.map((e) => e.message).join("; ")}`);
	if (agents.errors.length > 0) lines.push(`Agent sync errors: ${agents.errors.map((e) => e.message).join("; ")}`);
	return lines.join("\n");
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
