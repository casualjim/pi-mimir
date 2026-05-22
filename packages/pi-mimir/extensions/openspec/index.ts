/**
 * openspec — Pure-orchestrator extension for pi-mimir.
 *
 * Composes session hooks and slash commands. All logic lives in the
 * registrar modules; this file is the table of contents.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FLAG_DEBUG } from "./constants.js";
import { registerOpenSpecCommands } from "./openspec-commands.js";
import { registerSessionHooks } from "./session-hooks.js";
import { registerUpdateAgentsCommand } from "./update-agents.js";

export default function (pi: ExtensionAPI) {
	pi.registerFlag(FLAG_DEBUG, {
		description: "Show injected guidance and git-context messages",
		type: "boolean",
		default: false,
	});
	registerSessionHooks(pi);
	registerUpdateAgentsCommand(pi);
	registerOpenSpecCommands(pi);
}
