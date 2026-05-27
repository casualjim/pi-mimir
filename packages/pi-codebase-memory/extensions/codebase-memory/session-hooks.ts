import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handleCodebaseMemoryDiscoveryGate, resetCodebaseMemoryGate } from "./codebase-memory-gate.js";
import { ensureCodebaseMemoryMcpConfig } from "./mcp-config.js";

const MSG_TYPE_CODEBASE_MEMORY_TOOL_GUIDANCE = "codebase-memory-tool-guidance";

type UI = { notify: (msg: string, sev: "info" | "warning" | "error") => void };

export function registerSessionHooks(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		resetCodebaseMemoryGate(ctx.cwd);
		maybeEnsureMcpConfig(ctx.hasUI ? ctx.ui : undefined);
	});

	pi.on("session_compact", async (_event, ctx) => {
		resetCodebaseMemoryGate(ctx.cwd);
	});

	pi.on("session_shutdown", async () => {
		resetCodebaseMemoryGate();
	});

	pi.on("tool_call", async (event, ctx) => {
		const guidance = handleCodebaseMemoryDiscoveryGate(event, ctx.cwd);
		if (!guidance) return;
		pi.sendMessage({ customType: MSG_TYPE_CODEBASE_MEMORY_TOOL_GUIDANCE, content: guidance.content, display: false });
	});
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
