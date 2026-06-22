import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildGraphAugmentation, getPendingGraphAugment, type PendingGraphAugment, prependGraphAugmentation } from "./crumbs-augment.js";
import { CRUMBS_SESSION_REMINDER, handleCrumbsDiscoveryGate, resetCrumbsGate } from "./crumbs-gate.js";
import { ensureCrumbsMcpConfig } from "./mcp-config.js";
import { resetCrumbsBinCache } from "./bin-resolve.js";

const MSG_TYPE_CRUMBS_TOOL_GUIDANCE = "crumbs-tool-guidance";
const MSG_TYPE_CRUMBS_SESSION_REMINDER = "crumbs-session-reminder";
const pendingAugments = new Map<string, PendingGraphAugment>();

type UI = { notify: (msg: string, sev: "info" | "warning" | "error") => void };

export function registerSessionHooks(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		resetCrumbsBinCache();
		resetCrumbsGate(ctx.cwd);
		pendingAugments.clear();
		maybeEnsureMcpConfig(ctx.hasUI ? ctx.ui : undefined);
		injectSessionReminder(pi);
	});

	pi.on("session_compact", async (_event, ctx) => {
		resetCrumbsGate(ctx.cwd);
		pendingAugments.clear();
		injectSessionReminder(pi);
	});

	pi.on("session_shutdown", async () => {
		resetCrumbsGate();
		pendingAugments.clear();
	});

	pi.on("tool_call", async (event, ctx) => {
		const pending = getPendingGraphAugment(event);
		if (pending) pendingAugments.set(event.toolCallId, pending);

		const guidance = handleCrumbsDiscoveryGate(event, ctx.cwd);
		if (!guidance) return;
		pi.sendMessage({ customType: MSG_TYPE_CRUMBS_TOOL_GUIDANCE, content: guidance.content, display: false }, { deliverAs: "steer" });
	});

	pi.on("tool_result", async (event, ctx) => {
		const pending = pendingAugments.get(event.toolCallId);
		pendingAugments.delete(event.toolCallId);
		if (!pending || event.isError) return;
		const augmentation = await buildGraphAugmentation(ctx.cwd, pending);
		if (augmentation) return { content: prependGraphAugmentation(event.content, augmentation) };
	});
}

function injectSessionReminder(pi: ExtensionAPI): void {
	pi.sendMessage({ customType: MSG_TYPE_CRUMBS_SESSION_REMINDER, content: CRUMBS_SESSION_REMINDER, display: false }, { deliverAs: "nextTurn" });
}

function maybeEnsureMcpConfig(ui?: UI): void {
	const result = ensureCrumbsMcpConfig();
	if (result.created) {
		ui?.notify(`Configured crumbs MCP in ${result.path}. Reload Pi if the crumbs tools are not active yet.`, "info");
		return;
	}
	if (!result.configuredAlready && result.error) {
		ui?.notify(`Unable to configure crumbs MCP automatically: ${result.error}`, "warning");
	}
}
