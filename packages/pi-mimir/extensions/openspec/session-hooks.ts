/**
 * Session lifecycle wiring for openspec.
 *
 * Each handler body is a named helper; pi.on(...) lines are pure wiring.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { FLAG_DEBUG, MSG_TYPE_CODEBASE_MEMORY_GUIDANCE, MSG_TYPE_GIT_CONTEXT, MSG_TYPE_WORKFLOW_GUIDANCE } from "./constants.js";
import {
	clearGitContextCache,
	isGitMutatingCommand,
	resetInjectedMarker,
	takeGitContextIfChanged,
} from "./git-context.js";
import { clearInjectionState, handleToolCallGuidance, injectRootGuidance } from "./guidance.js";
import { findStaleOpenSpecAssets } from "./managed-assets.js";
import { CODEBASE_MEMORY_INSTALL_COMMAND, EXPECTED_CODEBASE_MEMORY_TOOLS, findWorkflowOverlaps, getCodebaseMemorySupportStatus } from "./package-checks.js";

const OPENSPEC_DIRS = [
	"openspec/changes",
	"openspec/profiles",
] as const;

const msgMissingCodebaseMemory = (pluginInstalled: boolean, missingTools: string[]) =>
	pluginInstalled
		? `codebase-memory support is still inactive in this session. Missing tools: ${missingTools.join(", ")}. Reload Pi or fix the plugin configuration before claiming full workflow readiness. Degraded discovery is in effect.`
		: `codebase-memory support is required for the full pi-mimir architecture-memory-first workflow. Install it with: ${CODEBASE_MEMORY_INSTALL_COMMAND}. Expected tools: ${EXPECTED_CODEBASE_MEMORY_TOOLS.join(", ")}. Degraded discovery is in effect until the plugin is installed and active.`;
const msgWorkflowOverlap = (list: string) =>
	`Known workflow plugin overlap detected (${list}). pi-mimir complements OpenSpec and offers optional composed plan/implement workflows; it does not treat workflow skill names or generated OpenSpec skills as conflicts.`;
const msgStaleOpenSpecAssets = (n: number) =>
	`${n} OpenSpec schema/config asset(s) have stale OpenSpec/source/hash markers. Run /openspec:update to refresh manifests.`;
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
	"Package entrypoints: `plan` runs the full planning workflow by composing OpenSpec proposal/spec/design/task behavior with one planning review; `implement` runs apply execution and verification; `review-plan` and `review-implementation` run standalone review entrypoints. Generated `/opsx:*` or `openspec-*` skills may coexist and may be called internally by these workflows. Implementation review is explicit and separate from `implement`. Do not add commit, push, PR creation, or finishing-branch behavior as workflow steps.",
	"",
	"Define intent first: if the requested outcome is ambiguous, ask a targeted clarification before codebase probing. Discovery ladder: codebase_memory_get_architecture → codebase_memory_search_graph/search_code → codebase_memory_trace_path → codebase_memory_get_code_snippet → exact file reads → direct synthesis. Stop when affected capabilities, impact areas, existing specs, and major implementation constraints are known.",
	"",
	"codebase-memory MCP is required for the full workflow. If the current project is not indexed yet, run codebase_memory_index_repository on the project root before discovery. If codebase-memory is unavailable or remains stale after indexing, report degraded discovery and use exact reads or shell inspection as degraded mode. Use raw tools freely for configs, non-code files, graph-insufficient cases, and read-before-edit. Use subagents only for the single planning review pass or explicit specialist implementation review deep dives.",
].join("\n");

type UI = { notify: (msg: string, sev: "info" | "warning" | "error") => void };

export function registerSessionHooks(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		clearInjectionState();
		injectWorkflowGuidance(pi);
		injectCodebaseMemoryGuidance(pi);
		injectRootGuidance(ctx.cwd, pi);
		scaffoldOpenSpecDirs(ctx.cwd);
		await injectGitContext(pi, (msg) =>
			pi.sendMessage({ customType: MSG_TYPE_GIT_CONTEXT, content: msg, display: !!pi.getFlag(FLAG_DEBUG) }),
		);
		if (ctx.hasUI) {
			warnMissingCodebaseMemory(ctx.ui, pi);
			warnWorkflowOverlaps(ctx.ui, ctx.cwd);
			warnStaleOpenSpecAssets(ctx.ui, ctx.cwd);
		}
	});

	pi.on("session_compact", async (_event, ctx) => {
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
		clearInjectionState();
		clearGitContextCache();
		resetInjectedMarker();
	});

	pi.on("tool_call", async (event, ctx) => {
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

function warnMissingCodebaseMemory(ui: UI, pi: ExtensionAPI): void {
	const status = getCodebaseMemorySupportStatus(pi);
	if (status.toolsAvailable) return;
	ui.notify(msgMissingCodebaseMemory(status.packageInstalled, status.missingTools), "warning");
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
