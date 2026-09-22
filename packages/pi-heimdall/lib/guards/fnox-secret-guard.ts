/**
 * fnox-secret-guard
 *
 * Blocks any `fnox` invocation in the bash tool that resolves secret values.
 * Covers: get (value fetch), exec (secret injection), sync (decrypted local
 * cache). Safe subcommands (set, provider, init, config-files, ...) pass.
 * fnox is a secrets manager like sops — values are only meant to reach the
 * user's own terminal, never the LLM context.
 */

import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SEG = "(?:[^;|&\\n]|\\\\\\n)";

const START = "(?:(?:^|[;|&\\n])\\s*)";
const ENV_PREFIX = "(?:[A-Z_][A-Z0-9_]*=[^\\s]*\\s+)*";
const CMD_FNOX = `(?:${START}${ENV_PREFIX}fnox\\b)`;
const CMD_FNOX_AFTER_DASHDASH = `(?:--\\s+${ENV_PREFIX}fnox\\b)`;
const FNOX_CMD = `(?:${CMD_FNOX}|${CMD_FNOX_AFTER_DASHDASH})`;

const NO_SAFE_AHEAD =
	`(?!${SEG}*\\b(?:set|unset|provider|init|config-files|completion|help|h|version)\\b)`;

export const FNOX_RESOLVE = new RegExp(
	`${FNOX_CMD}${NO_SAFE_AHEAD}${SEG}*\\b(?:get|exec|sync)\\b`,
	"m",
);

export function getFnoxBlockReason(command: string): string | null {
	if (!FNOX_RESOLVE.test(command)) return null;
	return (
		`Blocked: command would resolve secret values via fnox. ` +
		`This is protected by pi-heimdall/fnox-secret-guard. ` +
		`Ask the user to run this command directly in their terminal if needed. ` +
		`Never attempt to bypass this protection or ask the user to disable it.`
	);
}

export function registerFnoxSecretGuard(pi: ExtensionAPI, disabledSet: Set<string>): void {
	pi.on("tool_call", async (event, ctx) => {
		if (disabledSet.has("fnox-secret-guard")) return undefined;
		if (!isToolCallEventType("bash", event)) return undefined;

		const command = event.input.command;
		if (typeof command !== "string") return undefined;
		const reason = getFnoxBlockReason(command);
		if (!reason) return undefined;

		if (ctx.hasUI) {
			ctx.ui.notify("heimdall: blocked fnox secret resolution", "warning");
		}

		return {
			block: true,
			reason,
		};
	});
}
