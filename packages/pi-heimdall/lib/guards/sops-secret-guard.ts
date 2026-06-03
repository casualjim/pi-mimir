/**
 * sops-secret-guard
 *
 * Blocks any `sops` invocation in the bash tool that decrypts content.
 * Covers: decrypt subcommand, --decrypt/-d flags, exec-env, exec-file, edit, bare invocation.
 */

import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SEG = "(?:[^;|&\\n]|\\\\\\n)";

const START = "(?:(?:^|[;|&\\n])\\s*)";
const ENV_PREFIX = "(?:[A-Z_][A-Z0-9_]*=[^\\s]*\\s+)*";
const CMD_SOPS = `(?:${START}${ENV_PREFIX}sops\\b)`;
const CMD_SOPS_AFTER_DASHDASH = `(?:--\\s+${ENV_PREFIX}sops\\b)`;
const SOPS_CMD = `(?:${CMD_SOPS}|${CMD_SOPS_AFTER_DASHDASH})`;

const NO_SAFE_AHEAD =
	`(?!${SEG}*\\b(?:encrypt|rotate|publish|keyservice|filestatus|groups|updatekeys|set|unset|completion|help|h)\\b)` +
	`(?!${SEG}*(?:--encrypt\\b|--rotate\\b|-e\\b|-r\\b))` +
	`(?!${SEG}*(?:--version\\b|-v\\b))`;

export const SOPS_DECRYPT = new RegExp(
	`${SOPS_CMD}${SEG}*\\b(?:decrypt|exec-env|exec-file|edit)\\b` +
		`|${SOPS_CMD}${SEG}*(?:--decrypt\\b|-d\\b)` +
		`|${SOPS_CMD}${NO_SAFE_AHEAD}`,
	"m",
);

export function getSopsBlockReason(command: string): string | null {
	if (!SOPS_DECRYPT.test(command)) return null;
	return (
		`Blocked: command would decrypt secrets via sops. ` +
		`This is protected by pi-heimdall/sops-secret-guard. ` +
		`Ask the user to run this command directly in their terminal if needed. ` +
		`Never attempt to bypass this protection or ask the user to disable it.`
	);
}

export function registerSopsSecretGuard(pi: ExtensionAPI, disabledSet: Set<string>): void {
	pi.on("tool_call", async (event, ctx) => {
		if (disabledSet.has("sops-secret-guard")) return undefined;
		if (!isToolCallEventType("bash", event)) return undefined;

		const command = event.input.command;
		if (typeof command !== "string") return undefined;
		const reason = getSopsBlockReason(command);
		if (!reason) return undefined;

		if (ctx.hasUI) {
			ctx.ui.notify("heimdall: blocked sops decrypt", "warning");
		}

		return {
			block: true,
			reason,
		};
	});
}
