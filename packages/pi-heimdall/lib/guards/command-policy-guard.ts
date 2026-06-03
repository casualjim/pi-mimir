/**
 * command-policy-guard
 *
 * Blocks bash commands that violate repo policy as defined in `.pi/heimdall.json`.
 * Uses `shell-quote` for proper shell tokenization with bypass hardening.
 */

import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parse as shellParse, type ParseEntry } from "shell-quote";
import type { CommandPolicy, HeimdallConfig } from "../types.js";

const COMMAND_SEPARATORS = new Set([";", "&&", "||", "|", "(", ")"]);

const WRAPPER_COMMANDS = new Set([
	"sudo", "doas", "pkexec", "env", "exec", "nice", "ionice", "chrt",
	"taskset", "command", "time", "timeout", "strace", "gdb", "lldb",
	"valgrind", "eval",
]);

const SHELL_COMMANDS = new Set([
	"bash", "sh", "zsh", "dash", "ksh", "ash", "fish",
]);

const SHELL_PREFIX_TOKENS = new Set(["{", "("]);

const REDIRECT_OPS = new Set([">", ">>", "<", ">&", "<&", ">|", "&>", "&>>", "<<<"]);

function tokenBasename(token: string): string {
	if (!token.includes("/")) return token;
	const lastSlash = token.lastIndexOf("/");
	return lastSlash >= 0 ? token.substring(lastSlash + 1) : token;
}

function isStringToken(t: ParseEntry): t is string {
	return typeof t === "string";
}

function isOp(t: ParseEntry, op: string): boolean {
	return typeof t === "object" && "op" in t && t.op === op;
}

function splitCommandSegments(tokens: ParseEntry[]): string[][] {
	const segments: string[][] = [];
	let current: string[] = [];
	let heredocDelim: string | null = null;

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i]!;

		if (heredocDelim !== null) {
			if (isStringToken(t) && t === heredocDelim) {
				heredocDelim = null;
			}
			continue;
		}

		if (isOp(t, "<") && i + 1 < tokens.length && isOp(tokens[i + 1]!, "<")) {
			i++;
			if (i + 1 < tokens.length && isStringToken(tokens[i + 1]!)) {
				i++;
				heredocDelim = (tokens[i]! as string).replace(/^['"]|['"]$/g, "");
			}
			continue;
		}

		if (typeof t === "object" && "op" in t && COMMAND_SEPARATORS.has(t.op)) {
			if (current.length > 0) {
				segments.push(current);
				current = [];
			}
			continue;
		}

		if (typeof t === "object" && "op" in t && REDIRECT_OPS.has(t.op)) {
			if (i + 1 < tokens.length && isStringToken(tokens[i + 1]!)) {
				i++;
			}
			continue;
		}

		if (isStringToken(t)) {
			current.push(t);
		}
	}

	if (current.length > 0) {
		segments.push(current);
	}

	return segments;
}

function matchSegment(
	tokens: string[],
	policies: CommandPolicy[],
	checkRecursive: (cmd: string) => CommandPolicy | null,
): CommandPolicy | null {
	let pos = 0;

	while (pos < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[pos]!)) {
		pos++;
	}

	while (
		pos < tokens.length &&
		(WRAPPER_COMMANDS.has(tokens[pos]!) || SHELL_PREFIX_TOKENS.has(tokens[pos]!))
	) {
		pos++;
	}

	if (
		pos + 2 < tokens.length &&
		SHELL_COMMANDS.has(tokens[pos]!) &&
		tokens[pos + 1] === "-c" &&
		tokens[pos + 2] !== undefined
	) {
		const subResult = checkRecursive(tokens[pos + 2]!);
		if (subResult) return subResult;
	}

	const effective = tokens.slice(pos);

	for (const policy of policies) {
		if (effective.length < policy.blocked.length) continue;

		let match = true;
		for (let i = 0; i < policy.blocked.length; i++) {
			const got = effective[i]!;
			const want = policy.blocked[i]!;
			if (i === 0) {
				if (got !== want && tokenBasename(got) !== want) {
					match = false;
					break;
				}
			} else {
				if (got !== want) {
					match = false;
					break;
				}
			}
		}

		if (match) return policy;
	}

	return null;
}

export function checkCommand(command: string, policies: CommandPolicy[]): CommandPolicy | null {
	const parsed = shellParse(command);
	const segments = splitCommandSegments(parsed);
	const check = (cmd: string): CommandPolicy | null => checkCommand(cmd, policies);

	for (const segment of segments) {
		const policy = matchSegment(segment, policies, check);
		if (policy) return policy;
	}

	return null;
}

export function getCommandPolicyBlockReason(policy: CommandPolicy): string {
	return (
		`Blocked: command violates repo policy "${policy.name}".\n` +
		`${policy.message}\n` +
		`This is protected by pi-heimdall/command-policy-guard. ` +
		`Ask the user to run this command directly in their terminal if needed. ` +
		`Never attempt to bypass this protection or ask the user to disable it.`
	);
}

export function registerCommandPolicyGuard(pi: ExtensionAPI, getConfig: () => HeimdallConfig, disabledSet: Set<string>): void {
	let policies: CommandPolicy[] = [];

	// Reload on session start to pick up fresh config
	pi.on("session_start", async (_event, _ctx) => {
		if (disabledSet.has("command-policy-guard")) return;
		policies = getConfig().commandPolicies ?? [];
	});

	pi.on("tool_call", async (event, ctx) => {
		if (disabledSet.has("command-policy-guard")) return undefined;
		if (!isToolCallEventType("bash", event)) return undefined;
		if (policies.length === 0) return undefined;

		const command = event.input.command;
		if (typeof command !== "string") return undefined;

		const policy = checkCommand(command, policies);
		if (policy) {
			const reason = getCommandPolicyBlockReason(policy);

			if (ctx.hasUI) {
				ctx.ui.notify(`heimdall: blocked policy violation (${policy.name})`, "warning");
			}

			return { block: true, reason };
		}

		return undefined;
	});
}
