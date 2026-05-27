import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	registerAdvisorBeforeAgentStart,
	registerAdvisorCommand,
	registerAdvisorTool,
	registerModelSelectHandler,
	registerThinkingLevelSelectHandler,
	restoreAdvisorState,
} from "./advisor.js";
import { syncBundledAgents } from "./agents.js";

export default function (pi: ExtensionAPI) {
	registerAdvisorTool(pi);
	registerAdvisorCommand(pi);
	registerAdvisorBeforeAgentStart(pi);
	registerModelSelectHandler(pi);
	registerThinkingLevelSelectHandler(pi);

	pi.on("session_start", async (_event, ctx) => {
		const sync = syncBundledAgents(ctx.cwd);
		if (ctx.hasUI && sync.errors.length > 0) {
			ctx.ui.notify(`Advisor agent sync errors: ${sync.errors.map((error) => error.message).join("; ")}`, "warning");
		}
		restoreAdvisorState(ctx, pi);
	});
}
