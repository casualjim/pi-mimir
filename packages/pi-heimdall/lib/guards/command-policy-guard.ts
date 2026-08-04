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

// token sequences that forward to another command; longest match at a position wins.
// A trailing `--` right after a match is swallowed too (`sudo -- rm`, `mise exec -- cargo test`).
const WRAPPER_COMMANDS: readonly string[][] = [
	["sudo"], ["doas"], ["pkexec"], ["env"], ["exec"], ["nice"], ["ionice"], ["chrt"],
	["taskset"], ["command"], ["time"], ["timeout"], ["strace"], ["gdb"], ["lldb"],
	["valgrind"], ["eval"],
	["mise", "exec"], ["mise", "x"],
];

function matchWrapperAt(tokens: string[], pos: number): number {
	let best = 0;
	for (const seq of WRAPPER_COMMANDS) {
		if (seq.length <= best) continue;
		if (seq.every((t, i) => tokens[pos + i] === t)) best = seq.length;
	}
	return best;
}

const SHELL_COMMANDS = new Set([
	"bash", "sh", "zsh", "dash", "ksh", "ash", "fish",
]);

const SHELL_PREFIX_TOKENS = new Set(["{", "("]);

// control keywords that start a command list at a segment head:
// `for i in x; do cargo test; done`, `if true; then cargo test; fi`, `! cmd`
const SHELL_KEYWORD_PREFIXES = new Set([
	"if", "while", "until", "do", "then", "else", "elif", "!",
]);

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

	while (pos < tokens.length) {
		if (SHELL_PREFIX_TOKENS.has(tokens[pos]!) || SHELL_KEYWORD_PREFIXES.has(tokens[pos]!)) {
			pos++;
			continue;
		}
		const wrapperLen = matchWrapperAt(tokens, pos);
		if (wrapperLen > 0) {
			pos += wrapperLen;
			if (tokens[pos] === "--") pos++;
			continue;
		}
		break;
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

/**
 * shell-quote treats newlines as plain whitespace and lets `#` comments run
 * to the end of the string. Multi-line commands then collapse into one
 * segment and hide a blocked command behind a harmless prefix
 * (`cd /x\ncargo test`), and anything after a comment disappears entirely.
 * Bash instead treats unquoted newlines as command separators and comments
 * as line-scoped. Rewrite the command to match: separator newlines become
 * `;`, comments are cut at their line, and quoted newlines and heredoc
 * bodies pass through untouched.
 */
export function splitShellLines(command: string): string {
	const META_CHARS = " \t|&;()<>";
	let out = "";
	let i = 0;
	const n = command.length;
	// heredocs opened on the current line; bodies start at the next newline
	const heredocs: { delim: string; stripTabs: boolean }[] = [];
	let inBody = false;

	while (i < n) {
		const c = command[i]!;

		if (inBody) {
			// heredoc body is data, not commands — pass lines through verbatim;
			// when the last heredoc closes, end the command with `;` so tokens
			// after the delimiter start a fresh segment
			const eol = command.indexOf("\n", i);
			const line = eol === -1 ? command.slice(i) : command.slice(i, eol);
			const { delim, stripTabs } = heredocs[0]!;
			const candidate = stripTabs ? line.replace(/^\t+/, "") : line;
			out += line;
			if (eol !== -1) {
				if (candidate === delim) {
					heredocs.shift();
					if (heredocs.length === 0) {
						inBody = false;
						out += ";";
					} else {
						out += "\n";
					}
				} else {
					out += "\n";
				}
			}
			i = eol === -1 ? n : eol + 1;
			continue;
		}

		if (c === "\\") {
			// keep escape pair; also covers line continuation (backslash + newline)
			out += command.slice(i, i + 2);
			i += 2;
			continue;
		}

		if (c === "'") {
			const end = command.indexOf("'", i + 1);
			const stop = end === -1 ? n : end + 1;
			out += command.slice(i, stop);
			i = stop;
			continue;
		}

		if (c === '"') {
			let j = i + 1;
			while (j < n && command[j] !== '"') {
				if (command[j] === "\\") j++;
				j++;
			}
			if (j < n) j++; // include closing quote
			out += command.slice(i, j);
			i = j;
			continue;
		}

		if (c === "#") {
			const prev = i === 0 ? "" : command[i - 1]!;
			if (prev === "" || prev === "\n" || META_CHARS.includes(prev)) {
				// line comment: drop it; the newline still ends the command
				const eol = command.indexOf("\n", i);
				i = eol === -1 ? n : eol;
				continue;
			}
			// mid-word `#` (e.g. `x#y`, `$#`): quote it so shell-quote does
			// not start a comment here
			out += "'#'";
			i++;
			continue;
		}

		if (c === "<" && command[i + 1] === "<") {
			if (command[i + 2] === "<") {
				out += "<<<";
				i += 3;
				continue;
			}
			out += "<<";
			i += 2;
			let stripTabs = false;
			if (command[i] === "-") {
				stripTabs = true;
				out += "-";
				i++;
			}
			while (i < n && (command[i] === " " || command[i] === "\t")) {
				out += command[i];
				i++;
			}
			let delim = "";
			if (command[i] === "'" || command[i] === '"') {
				const q = command[i];
				out += q;
				i++;
				while (i < n && command[i] !== q) {
					delim += command[i];
					out += command[i];
					i++;
				}
				if (i < n) {
					out += command[i];
					i++;
				}
			} else {
				while (i < n) {
					const d = command[i]!;
					if (d === "\n" || d === "\\" || META_CHARS.includes(d)) break;
					delim += d;
					out += d;
					i++;
				}
			}
			if (delim.length > 0) heredocs.push({ delim, stripTabs });
			continue;
		}

		if (c === "\n") {
			if (heredocs.length > 0) {
				out += "\n";
				inBody = true;
			} else {
				out += ";";
			}
			i++;
			continue;
		}

		out += c;
		i++;
	}

	return out;
}

export function checkCommand(command: string, policies: CommandPolicy[], nonBare = false): CommandPolicy | null {
	const parsed = shellParse(splitShellLines(command));
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
