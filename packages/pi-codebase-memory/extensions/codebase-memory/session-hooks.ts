import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildAdrIngestionPrompt, getToolInputPath, isAdrWriteResult } from "./adr-watcher.js";
import { buildGraphAugmentation, getPendingGraphAugment, type PendingGraphAugment, prependGraphAugmentation } from "./codebase-memory-augment.js";
import { CODEBASE_MEMORY_SESSION_REMINDER, handleCodebaseMemoryDiscoveryGate, resetCodebaseMemoryGate } from "./codebase-memory-gate.js";
import { ensureCodebaseMemoryMcpConfig } from "./mcp-config.js";

const MSG_TYPE_CODEBASE_MEMORY_TOOL_GUIDANCE = "codebase-memory-tool-guidance";
const MSG_TYPE_CODEBASE_MEMORY_SESSION_REMINDER = "codebase-memory-session-reminder";
const pendingAugments = new Map<string, PendingGraphAugment>();

type UI = { notify: (msg: string, sev: "info" | "warning" | "error") => void };

export function registerSessionHooks(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		resetCodebaseMemoryGate(ctx.cwd);
		pendingAugments.clear();
		maybeEnsureMcpConfig(ctx.hasUI ? ctx.ui : undefined);
		injectSessionReminder(pi);
	});

	pi.on("session_compact", async (_event, ctx) => {
		resetCodebaseMemoryGate(ctx.cwd);
		pendingAugments.clear();
		injectSessionReminder(pi);
	});

	pi.on("session_shutdown", async () => {
		resetCodebaseMemoryGate();
		pendingAugments.clear();
	});

	pi.on("tool_call", async (event, ctx) => {
		const pending = getPendingGraphAugment(event);
		if (pending) pendingAugments.set(event.toolCallId, pending);

		const guidance = handleCodebaseMemoryDiscoveryGate(event, ctx.cwd);
		if (!guidance) return;
		pi.sendMessage({ customType: MSG_TYPE_CODEBASE_MEMORY_TOOL_GUIDANCE, content: guidance.content, display: false }, { deliverAs: "steer" });
	});

	pi.on("tool_result", async (event, ctx) => {
		const pending = pendingAugments.get(event.toolCallId);
		pendingAugments.delete(event.toolCallId);
		if (pending && !event.isError) {
			const augmentation = await buildGraphAugmentation(ctx.cwd, pending);
			if (augmentation) return { content: prependGraphAugmentation(event.content, augmentation) };
		}

		if (!isAdrWriteResult(event)) return;
		const adrPath = getToolInputPath(event.input);
		if (!adrPath) return;
		pi.sendUserMessage(buildAdrIngestionPrompt(adrPath, ctx.cwd), { deliverAs: "followUp" });
	});
}

function injectSessionReminder(pi: ExtensionAPI): void {
	pi.sendMessage({ customType: MSG_TYPE_CODEBASE_MEMORY_SESSION_REMINDER, content: CODEBASE_MEMORY_SESSION_REMINDER, display: false }, { deliverAs: "nextTurn" });
}

function maybeEnsureMcpConfig(ui?: UI): void {
	const result = ensureCodebaseMemoryMcpConfig();
	if (result.created) {
		ui?.notify(`Configured codebase-memory MCP in ${result.path}. Reload Pi if the codebase_memory_* tools are not active yet.`, "info");
		return;
	}
	if (!result.configuredAlready && result.error) {
		ui?.notify(`Unable to configure codebase-memory MCP automatically: ${result.error}`, "warning");
	}
}
