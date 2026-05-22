/**
 * /openspec:update — refreshes OpenSpec Pi tooling and bundled workflow assets.
 * Runs openspec update --tools pi, then syncs schemas, skills, agents, and manifests.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type SyncResult, syncBundledAgents } from "./agents.js";
import {
	ensureCodebaseMemoryBridge,
	ensureReviewGatedOpenSpecConfig,
	syncBundledSkills,
} from "./openspec-commands.js";
import { writeOpenSpecAssetManifest } from "./managed-assets.js";
import { syncBundledSchemas } from "./schema-sync.js";

const OPENSPEC_TIMEOUT_MS = 120_000;
const MSG_NO_CHANGES = "No changes needed.";

type CommandContext = {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
};

const msgSyncedWithErrors = (summary: string, errors: string[]) =>
	`${summary} ${errors.length} error(s): ${errors.join("; ")}`;

export function registerUpdateAgentsCommand(pi: ExtensionAPI): void {
	pi.registerCommand("openspec:update", {
		description: "Update OpenSpec Pi tooling and refresh bundled schemas, skills, agents, and manifests",
		handler: async (_args, ctx: CommandContext) => {
			const update = await pi.exec("openspec", ["update"], { cwd: ctx.cwd, timeout: OPENSPEC_TIMEOUT_MS });
			if (update.code !== 0) {
				notify(ctx, formatExecFailure("openspec update", update), "error");
				return;
			}

			const config = ensureReviewGatedOpenSpecConfig(ctx.cwd);
			const schemas = syncBundledSchemas(false);
			const skills = syncBundledSkills(ctx.cwd);
			const agents = syncBundledAgents(ctx.cwd, true);
			writeOpenSpecAssetManifest(ctx.cwd);
			const codebaseMemory = await ensureCodebaseMemoryBridge(pi);
			if (!ctx.hasUI) return;
			ctx.ui?.notify(buildUpdateReport(config.updated, schemas, skills, agents, codebaseMemory), updateReportLevel(schemas, agents, codebaseMemory));
		},
	});
}

function buildUpdateReport(
	configUpdated: boolean,
	schemas: ReturnType<typeof syncBundledSchemas>,
	skills: ReturnType<typeof syncBundledSkills>,
	agents: SyncResult,
	codebaseMemory: Awaited<ReturnType<typeof ensureCodebaseMemoryBridge>>,
): string {
	const lines = ["OpenSpec Pi workflow updated."];
	lines.push(configUpdated ? "Configured openspec/config.yaml with schema: review-gated." : "openspec/config.yaml already uses schema: review-gated.");
	lines.push(`Updated schemas: ${countSummary(schemas.added.length, schemas.updated.length, schemas.removed.length)}.`);
	lines.push(`Updated skills: ${countSummary(skills.added.length, skills.updated.length)}.`);
	lines.push(`Updated agents: ${formatSyncReport(agents)}.`);
	if (schemas.pendingUpdate.length > 0 || schemas.pendingRemove.length > 0) lines.push("Some schema files have local edits and were left untouched.");
	if (schemas.errors.length > 0) lines.push(`Schema sync errors: ${schemas.errors.map((e) => e.message).join("; ")}`);
	if (agents.errors.length > 0) lines.push(`Agent sync errors: ${agents.errors.map((e) => e.message).join("; ")}`);
	if (codebaseMemory.codebaseMemoryMcpConfigCreated) lines.push(`Configured codebase-memory MCP in ${codebaseMemory.codebaseMemoryMcpConfigPath}. Restart/reload Pi if the new MCP server is not active yet.`);
	else if (codebaseMemory.codebaseMemoryMcpConfiguredAlready) lines.push("Existing codebase-memory MCP configuration preserved.");
	else if (!codebaseMemory.codebaseMemoryMcpConfigured) lines.push(`WARNING: codebase-memory MCP is required for full pi-mimir architecture-memory-first discovery${codebaseMemory.codebaseMemoryMcpConfigError ? `: ${codebaseMemory.codebaseMemoryMcpConfigError}` : ""}.`);
	return lines.join("\n");
}

function formatSyncReport(result: SyncResult): string {
	const totalSynced = result.added.length + result.updated.length + result.removed.length;
	const parts: string[] = [];
	if (result.added.length > 0) parts.push(`${result.added.length} added`);
	if (result.updated.length > 0) parts.push(`${result.updated.length} updated`);
	if (result.removed.length > 0) parts.push(`${result.removed.length} removed`);

	const summary = totalSynced > 0 ? parts.join(", ") : MSG_NO_CHANGES;
	if (result.errors.length > 0) {
		return msgSyncedWithErrors(
			summary,
			result.errors.map((e) => e.message),
		);
	}
	return summary;
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

function updateReportLevel(
	schemas: ReturnType<typeof syncBundledSchemas>,
	agents: SyncResult,
	codebaseMemory: Awaited<ReturnType<typeof ensureCodebaseMemoryBridge>>,
): "info" | "warning" {
	return schemas.errors.length > 0 || agents.errors.length > 0 || !codebaseMemory.adapterInstallSucceeded || !codebaseMemory.codebaseMemoryMcpConfigured ? "warning" : "info";
}
