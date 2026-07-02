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
// redirects that send output elsewhere — bare policy blocks on these (not input `<`/`<<<`/`<&`)
const OUTPUT_REDIRECT_OPS = new Set([">", ">>", ">&", ">|", "&>", "&>>"]);

function tokenBasename(token: string): string {
	if (!token.includes("/")) return token;
	const lastSlash = token.lastIndexOf("/");
	return lastSlash >= 0 ? token.substring(lastSlash + 1) : token;
}

function isStringToken(t: ParseEntry): t is string {
	return typeof t === "string";
}

interface Segment {
	tokens: string[];
	/** output piped to a following `|` */
	pipedOut: boolean;
	/** output redirected (`>`, `>>`, `>&`, `>|`, `&>`, `&>>`) */
	outputRedirected: boolean;
}

function isOp(t: ParseEntry, op: string): boolean {
	return typeof t === "object" && "op" in t && t.op === op;
}

function splitCommandSegments(tokens: ParseEntry[]): Segment[] {
	const segments: Segment[] = [];
	let current: string[] = [];
	let outputRedirected = false;
	let pipedOut = false;
	let heredocDelim: string | null = null;

	const close = () => {
		if (current.length > 0) {
			segments.push({ tokens: current, pipedOut, outputRedirected });
		}
		current = [];
		outputRedirected = false;
		pipedOut = false;
	};

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
			// heredoc — input side, not output
			if (i + 1 < tokens.length && isStringToken(tokens[i + 1]!)) {
				i++;
				heredocDelim = (tokens[i]! as string).replace(/^['"]|['"]$/g, "");
			}
			continue;
		}

		if (typeof t === "object" && "op" in t && COMMAND_SEPARATORS.has(t.op)) {
			if (t.op === "|") {
				pipedOut = true;
				close();
			} else {
				close();
			}
			continue;
		}

		if (typeof t === "object" && "op" in t && REDIRECT_OPS.has(t.op)) {
			if (OUTPUT_REDIRECT_OPS.has(t.op)) outputRedirected = true;
			if (i + 1 < tokens.length && isStringToken(tokens[i + 1]!)) {
				i++;
			}
			continue;
		}

		if (isStringToken(t)) {
			current.push(t);
		}
	}

	close();

	return segments;
}

function matchSegment(
	segment: Segment,
	policies: CommandPolicy[],
	checkRecursive: (cmd: string, nonBare: boolean) => CommandPolicy | null,
	inheritedNonBare: boolean,
): CommandPolicy | null {
	const tokens = segment.tokens;
	const segmentNonBare = segment.pipedOut || segment.outputRedirected || inheritedNonBare;
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
		const subResult = checkRecursive(tokens[pos + 2]!, segmentNonBare);
		if (subResult) return subResult;
	}

	const effective = tokens.slice(pos);

	for (const policy of policies) {
		const bl = policy.blocked;
		if (bl.length === 0 || effective.length < bl.length) continue;

		// bare policies: blocked tokens may appear anywhere in the segment
		// (e.g. after wrapper args like `timeout 900`); what matters is only
		// what follows — pipe/redirect flips segmentNonBare and blocks.
		// non-bare policies keep prefix match to avoid matching blocked tokens
		// when they appear as data (echo "cargo test", grep, git commit -m, ...).
		const sEnd = policy.bare ? effective.length - bl.length : 0;
		let matched = false;
		for (let s = 0; s <= sEnd && !matched; s++) {
			let ok = true;
			for (let i = 0; i < bl.length; i++) {
				const got = effective[s + i]!;
				const want = bl[i]!;
				if (i === 0) {
					if (got !== want && tokenBasename(got) !== want) {
						ok = false;
						break;
					}
				} else if (got !== want) {
					ok = false;
					break;
				}
			}
			if (ok) matched = true;
		}

		if (!matched) continue;
		// bare policy: allow when the command actually runs bare
		if (policy.bare && !segmentNonBare) continue;
		return policy;
	}

	return null;
}

export function checkCommand(command: string, policies: CommandPolicy[], nonBare = false): CommandPolicy | null {
	const parsed = shellParse(command);
	const segments = splitCommandSegments(parsed);
	const check = (cmd: string, inheritNonBare: boolean): CommandPolicy | null => checkCommand(cmd, policies, inheritNonBare);

	for (const segment of segments) {
		const policy = matchSegment(segment, policies, check, nonBare);
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
