/**
 * Session lifecycle wiring for openspec-core.
 *
 * Each handler body is a named helper; pi.on(...) lines are pure wiring.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { type SyncResult, syncBundledAgents } from "./agents.js";
import { FLAG_DEBUG, MSG_TYPE_GIT_CONTEXT } from "./constants.js";
import {
	clearGitContextCache,
	isGitMutatingCommand,
	resetInjectedMarker,
	takeGitContextIfChanged,
} from "./git-context.js";
import { clearInjectionState, handleToolCallGuidance, injectRootGuidance } from "./guidance.js";
import { findMissingSiblings } from "./package-checks.js";

const OPENSPEC_DIRS = [
	"openspec/changes",
	"openspec/profiles",
] as const;

const msgAgentsAdded = (n: number) => `Copied ${n} openspec agent(s) to .pi/agents/`;
const msgAgentsHealed = (parts: string[]) => `Synced bundled agent(s): ${parts.join(", ")}.`;
const msgAgentsDrift = (parts: string[]) => `${parts.join(", ")} agent(s). Run /openspec-update-agents to sync.`;
const msgAgentsErrors = (n: number) => `Agent sync reported ${n} error(s). Run /openspec-update-agents for details.`;
const msgMissingSiblings = (n: number, list: string) =>
	`pi-openspec-workflow requires ${n} sibling extension(s): ${list}. Run /openspec-setup to install them.`;

type UI = { notify: (msg: string, sev: "info" | "warning" | "error") => void };

export function registerSessionHooks(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		clearInjectionState();
		injectRootGuidance(ctx.cwd, pi);
		scaffoldOpenSpecDirs(ctx.cwd);
		await injectGitContext(pi, (msg) =>
			pi.sendMessage({ customType: MSG_TYPE_GIT_CONTEXT, content: msg, display: !!pi.getFlag(FLAG_DEBUG) }),
		);
		const agents = syncBundledAgents(ctx.cwd, false);
		if (ctx.hasUI) {
			notifyAgentSyncDrift(ctx.ui, agents);
			warnMissingSiblings(ctx.ui);
		}
	});

	pi.on("session_compact", async (_event, ctx) => {
		clearInjectionState();
		clearGitContextCache();
		resetInjectedMarker();
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

function warnMissingSiblings(ui: UI): void {
	const missing = findMissingSiblings();
	if (missing.length === 0) return;
	ui.notify(msgMissingSiblings(missing.length, missing.map((m) => m.pkg.replace(/^npm:/, "")).join(", ")), "warning");
}
