/**
 * Session lifecycle wiring for openspec.
 *
 * Each handler body is a named helper; pi.on(...) lines are pure wiring.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { type SyncResult, syncBundledAgents } from "./agents.js";
import { handleCodebaseMemoryDiscoveryGate, resetCodebaseMemoryGate } from "./codebase-memory-gate.js";
import { FLAG_DEBUG, MSG_TYPE_CODEBASE_MEMORY_GUIDANCE, MSG_TYPE_CODEBASE_MEMORY_TOOL_GUIDANCE, MSG_TYPE_GIT_CONTEXT, MSG_TYPE_WORKFLOW_GUIDANCE } from "./constants.js";
import {
	clearGitContextCache,
	isGitMutatingCommand,
	resetInjectedMarker,
	takeGitContextIfChanged,
} from "./git-context.js";
import { clearInjectionState, handleToolCallGuidance, injectRootGuidance } from "./guidance.js";
import { findStaleOpenSpecAssets } from "./managed-assets.js";
import { EXPECTED_CODEBASE_MEMORY_TOOLS, codebaseMemoryMcpNeedsDirectTools, findWorkflowOverlaps, hasCodebaseMemoryMcp } from "./package-checks.js";

const OPENSPEC_DIRS = [
	"openspec/changes",
	"openspec/profiles",
] as const;

const msgAgentsAdded = (n: number) => `Copied ${n} openspec agent(s) to .pi/agents/`;
const msgAgentsHealed = (parts: string[]) => `Synced bundled agent(s): ${parts.join(", ")}.`;
const msgAgentsDrift = (parts: string[]) => `${parts.join(", ")} agent(s). Run /openspec-update-agents to sync.`;
const msgAgentsErrors = (n: number) => `Agent sync reported ${n} error(s). Run /openspec-update-agents for details.`;
const msgMissingCodebaseMemory = () =>
	`codebase-memory MCP is required for the full pi-mimir architecture-memory-first workflow. Run /openspec:init to install/check pi-mcp-adapter, then configure codebase-memory MCP and verify tools: ${EXPECTED_CODEBASE_MEMORY_TOOLS.join(", ")}. Exact file reads are degraded fallback only.`;
const msgMissingDirectTools = () =>
	"codebase-memory MCP is configured without directTools: true. It can still work through MCP, but direct codebase_memory_* tools may not be exposed.";
const msgWorkflowOverlap = (list: string) =>
	`OpenSpec workflow overlap detected (${list}). These packages/skills may over-trigger or steer a conflicting workflow; prefer plan/implement for this package and keep generated OpenSpec skills for explicit sync/archive actions.`;
const msgStaleOpenSpecAssets = (n: number) =>
	`${n} OpenSpec schema/config asset(s) have stale OpenSpec/source/hash markers. Run /openspec-update-agents to refresh manifests.`;
const CODEBASE_MEMORY_GUIDANCE = [
	"# codebase-memory Discovery Guidance",
	"",
	"Before raw code discovery, verify codebase-memory is usable for this project.",
	"",
	"1. If the current project is not indexed yet, run `codebase_memory_index_repository` on the project root.",
	"2. Start discovery with `codebase_memory_get_architecture`.",
	"3. Use `codebase_memory_search_graph` or `codebase_memory_search_code` for symbols/code search.",
	"4. Use `codebase_memory_trace_path` for callers/callees/data-flow impact.",
	"5. Use `codebase_memory_get_code_snippet` for exact symbol source after graph search.",
	"6. Use exact file reads or shell inspection for text, configs, non-code files, graph-insufficient cases, and exact follow-up reads; when codebase-memory is unavailable/stale, treat this as degraded discovery.",
	"",
	"When codebase-memory is unavailable or remains stale after indexing, explicitly report degraded discovery and do not claim architecture-aware discovery.",
].join("\n");

const WORKFLOW_GUIDANCE = [
	"# OpenSpec Workflow Guidance",
	"",
	"Preferred package entrypoints: `plan` for OpenSpec proposal/spec/design/task planning, `implement` for apply execution, verification, and review, `review-plan` for standalone artifact review gates, and `review-implementation` for standalone implementation review gates. Generated `/opsx:*` or `openspec-*` skills may coexist; reuse generated sync/archive behavior explicitly. Do not add commit, push, PR creation, or finishing-branch behavior as workflow steps.",
	"",
	"Define intent first: if the requested outcome is ambiguous, ask a targeted clarification before codebase probing. Discovery ladder: codebase_memory_get_architecture → codebase_memory_search_graph/search_code → codebase_memory_trace_path → codebase_memory_get_code_snippet → exact file reads → direct synthesis. Stop when affected capabilities, impact areas, existing specs, and major implementation constraints are known.",
	"",
	"codebase-memory MCP is required for the full workflow. If the current project is not indexed yet, run codebase_memory_index_repository on the project root before discovery. If codebase-memory is unavailable or remains stale after indexing, report degraded discovery and use exact reads or shell inspection as degraded mode. Use raw tools freely for configs, non-code files, graph-insufficient cases, and read-before-edit. Use subagents only at artifact review or specialist implementation review gates.",
].join("\n");

type UI = { notify: (msg: string, sev: "info" | "warning" | "error") => void };

export function registerSessionHooks(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		resetCodebaseMemoryGate(ctx.cwd);
		clearInjectionState();
		injectWorkflowGuidance(pi);
		injectCodebaseMemoryGuidance(pi);
		injectRootGuidance(ctx.cwd, pi);
		scaffoldOpenSpecDirs(ctx.cwd);
		await injectGitContext(pi, (msg) =>
			pi.sendMessage({ customType: MSG_TYPE_GIT_CONTEXT, content: msg, display: !!pi.getFlag(FLAG_DEBUG) }),
		);
		const agents = syncBundledAgents(ctx.cwd, false);
		if (ctx.hasUI) {
			notifyAgentSyncDrift(ctx.ui, agents);
			warnMissingCodebaseMemory(ctx.ui);
			warnWorkflowOverlaps(ctx.ui, ctx.cwd);
			warnStaleOpenSpecAssets(ctx.ui, ctx.cwd);
		}
	});

	pi.on("session_compact", async (_event, ctx) => {
		resetCodebaseMemoryGate(ctx.cwd);
		clearInjectionState();
		clearGitContextCache();
		resetInjectedMarker();
		injectWorkflowGuidance(pi);
		injectCodebaseMemoryGuidance(pi);
		injectRootGuidance(ctx.cwd, pi);
		await injectGitContext(pi, (msg) =>
			pi.sendMessage({ customType: MSG_TYPE_GIT_CONTEXT, content: msg, display: !!pi.getFlag(FLAG_DEBUG) }),
		);
	});

	pi.on("session_shutdown", async () => {
		resetCodebaseMemoryGate();
		clearInjectionState();
		clearGitContextCache();
		resetInjectedMarker();
	});

	pi.on("tool_call", async (event, ctx) => {
		const guidance = handleCodebaseMemoryDiscoveryGate(event, ctx.cwd);
		if (guidance) {
			pi.sendMessage({ customType: MSG_TYPE_CODEBASE_MEMORY_TOOL_GUIDANCE, content: guidance.content, display: !!pi.getFlag(FLAG_DEBUG) });
		}
		handleToolCallGuidance(event, ctx, pi);
		if (isToolCallEventType("bash", event) && isGitMutatingCommand(event.input.command)) {
			clearGitContextCache();
		}
	});

	pi.on("before_agent_start", async () => {
		const content = await takeGitContextIfChanged(pi);
		if (!content) return;
		return { message: { customType: MSG_TYPE_GIT_CONTEXT, content, display: !!pi.getFlag(FLAG_DEBUG) } };
	});
}

function injectWorkflowGuidance(pi: ExtensionAPI): void {
	pi.sendMessage({
		customType: MSG_TYPE_WORKFLOW_GUIDANCE,
		content: WORKFLOW_GUIDANCE,
		display: !!pi.getFlag(FLAG_DEBUG),
	});
}

function injectCodebaseMemoryGuidance(pi: ExtensionAPI): void {
	pi.sendMessage({
		customType: MSG_TYPE_CODEBASE_MEMORY_GUIDANCE,
		content: CODEBASE_MEMORY_GUIDANCE,
		display: !!pi.getFlag(FLAG_DEBUG),
	});
}

function scaffoldOpenSpecDirs(cwd: string): void {
	for (const dir of OPENSPEC_DIRS) {
		mkdirSync(join(cwd, dir), { recursive: true });
	}
}

async function injectGitContext(pi: ExtensionAPI, send: (msg: string) => void): Promise<void> {
	const msg = await takeGitContextIfChanged(pi);
	if (msg) send(msg);
}

function notifyAgentSyncDrift(ui: UI, result: SyncResult): void {
	if (result.added.length > 0) {
		ui.notify(msgAgentsAdded(result.added.length), "info");
	}
	const healed: string[] = [];
	if (result.updated.length > 0) healed.push(`${result.updated.length} updated`);
	if (result.removed.length > 0) healed.push(`${result.removed.length} removed`);
	if (healed.length > 0) {
		ui.notify(msgAgentsHealed(healed), "info");
	}
	const drift: string[] = [];
	if (result.pendingUpdate.length > 0) drift.push(`${result.pendingUpdate.length} outdated`);
	if (result.pendingRemove.length > 0) drift.push(`${result.pendingRemove.length} removed from bundle`);
	if (drift.length > 0) {
		ui.notify(msgAgentsDrift(drift), "info");
	}
	if (result.errors.length > 0) {
		ui.notify(msgAgentsErrors(result.errors.length), "warning");
	}
}

function warnMissingCodebaseMemory(ui: UI): void {
	if (!hasCodebaseMemoryMcp()) {
		ui.notify(msgMissingCodebaseMemory(), "warning");
		return;
	}
	if (codebaseMemoryMcpNeedsDirectTools()) ui.notify(msgMissingDirectTools(), "info");
}

function warnWorkflowOverlaps(ui: UI, cwd: string): void {
	const overlaps = findWorkflowOverlaps(cwd);
	if (overlaps.length === 0) return;
	ui.notify(msgWorkflowOverlap(overlaps.join(", ")), "warning");
}

function warnStaleOpenSpecAssets(ui: UI, cwd: string): void {
	const stale = findStaleOpenSpecAssets(cwd);
	if (stale.length === 0) return;
	ui.notify(msgStaleOpenSpecAssets(stale.length), "warning");
}
