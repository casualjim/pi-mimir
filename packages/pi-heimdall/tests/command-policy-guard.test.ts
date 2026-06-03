/**
 * Test harness for command-policy-guard.
 * Run with: npx tsx tests/command-policy-guard.test.ts
 */

import { parse as shellParse } from "shell-quote";

// ── Inline copies of extension logic for standalone testing ──

interface CommandPolicy {
	name: string;
	blocked: string[];
	message: string;
}

type ParseEntry = string | { op: string } | { op: "glob"; pattern: string } | { comment: string };

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

		if (
			isOp(t, "<") &&
			i + 1 < tokens.length &&
			isOp(tokens[i + 1]!, "<")
		) {
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
		(WRAPPER_COMMANDS.has(tokens[pos]!) ||
			SHELL_PREFIX_TOKENS.has(tokens[pos]!))
	) {
		pos++;
	}

	if (
		pos + 2 < tokens.length &&
		SHELL_COMMANDS.has(tokens[pos]!) &&
		tokens[pos + 1] === "-c" &&
		tokens[pos + 2] !== undefined
	) {
		const cmdString = tokens[pos + 2]!;
		const subResult = checkRecursive(cmdString);
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

function checkCommand(
	command: string,
	policies: CommandPolicy[],
): CommandPolicy | null {
	const parsed: ParseEntry[] = shellParse(command);
	const segments = splitCommandSegments(parsed);
	const check = (cmd: string): CommandPolicy | null => checkCommand(cmd, policies);

	for (const segment of segments) {
		const policy = matchSegment(segment, policies, check);
		if (policy) return policy;
	}

	return null;
}

// ── Test data ──

const policies: CommandPolicy[] = [
	{
		name: "no-cargo-test",
		blocked: ["cargo", "test"],
		message: "Use mise test instead.",
	},
	{
		name: "no-cargo-nextest",
		blocked: ["cargo", "nextest"],
		message: "Use mise test instead.",
	},
];

interface TestCase {
	cmd: string;
	shouldBlock: boolean;
	note: string;
}

const cases: TestCase[] = [
	// ── Basic blocking ──
	{ cmd: "cargo test", shouldBlock: true, note: "basic cargo test" },
	{ cmd: "cargo test --lib", shouldBlock: true, note: "cargo test with args" },
	{ cmd: "  cargo   test  ", shouldBlock: true, note: "extra whitespace" },
	{ cmd: "cargo nextest run", shouldBlock: true, note: "cargo nextest" },

	// ── Segment boundaries ──
	{ cmd: "echo foo; cargo test", shouldBlock: true, note: "after semicolon" },
	{ cmd: "echo foo && cargo test", shouldBlock: true, note: "after &&" },
	{ cmd: "echo foo || cargo test", shouldBlock: true, note: "after ||" },
	{ cmd: "echo foo | cargo test", shouldBlock: true, note: "after pipe" },
	// shell-parse flattens bare newlines into whitespace.
	// `echo foo\ncargo test` → ["echo","foo","cargo","test"] → prefix echo, no match.
	{ cmd: "echo foo\ncargo test", shouldBlock: false, note: "newline flattened (acceptable gap)" },

	// ── Redirections ──
	{ cmd: "cargo test 2>&1", shouldBlock: true, note: "with stderr redirect" },
	{ cmd: "cargo test 2>/dev/null", shouldBlock: true, note: "with stderr suppress" },
	{ cmd: "cargo test > output.txt", shouldBlock: true, note: "with stdout redirect" },
	{ cmd: "cargo test | tee output.txt", shouldBlock: true, note: "piped to tee" },

	// ── Env prefix ──
	{
		cmd: "CARGO_TARGET_DIR=/tmp cargo test",
		shouldBlock: true,
		note: "single env prefix",
	},
	{
		cmd: "A=1 B=2 cargo test",
		shouldBlock: true,
		note: "multiple env prefixes",
	},

	// ── Wrapper commands ──
	{ cmd: "sudo cargo test", shouldBlock: true, note: "sudo wrapper" },
	{ cmd: "env cargo test", shouldBlock: true, note: "env wrapper" },
	{ cmd: "exec cargo test", shouldBlock: true, note: "exec wrapper" },
	{ cmd: "eval cargo test", shouldBlock: true, note: "eval wrapper" },
	{ cmd: "nice cargo test", shouldBlock: true, note: "nice wrapper" },

	// ── Shell prefix tokens ──
	{ cmd: "{ cargo test; }", shouldBlock: true, note: "command group" },
	{ cmd: "( cargo test )", shouldBlock: true, note: "subshell" },

	// ── Shell -c recursion ──
	{
		cmd: "bash -c 'cargo test'",
		shouldBlock: true,
		note: "bash -c recursion",
	},
	{
		cmd: "sh -c 'cargo test'",
		shouldBlock: true,
		note: "sh -c recursion",
	},
	{
		cmd: "zsh -c 'cargo test'",
		shouldBlock: true,
		note: "zsh -c recursion",
	},
	{
		cmd: 'bash -c "cargo test && echo done"',
		shouldBlock: true,
		note: "bash -c with compound command",
	},

	// ── Path-qualified commands (basename matching) ──
	{
		cmd: "/usr/bin/cargo test",
		shouldBlock: true,
		note: "absolute path to cargo",
	},
	{
		cmd: "~/.cargo/bin/cargo test",
		shouldBlock: true,
		note: "tilde path to cargo",
	},
	{
		cmd: "./cargo test",
		shouldBlock: true,
		note: "relative path to cargo",
	},
	{
		cmd: "../target/debug/cargo test",
		shouldBlock: true,
		note: "relative path with dirs",
	},

	// ── Backslash escaping ──
	{
		cmd: "car\\go test",
		shouldBlock: true,
		note: "backslash in command name (bash sees cargo)",
	},

	// ── Quote splicing ──
	{
		cmd: "ca''rgo test",
		shouldBlock: true,
		note: "empty single quotes spliced",
	},
	{
		cmd: 'ca""rgo test',
		shouldBlock: true,
		note: "empty double quotes spliced",
	},
	{
		cmd: "c'a'rgo test",
		shouldBlock: true,
		note: "single-quoted char spliced",
	},

	// ── Heredoc (should NOT block) ──
	{
		cmd: "cat <<EOF\ncargo test\nEOF",
		shouldBlock: false,
		note: "heredoc content",
	},
	{
		cmd: "cat > script.sh <<'EOF'\ncargo test\nEOF",
		shouldBlock: false,
		note: "heredoc to file",
	},

	// ── Not commands (should NOT block) ──
	{
		cmd: "echo cargo test",
		shouldBlock: false,
		note: "cargo test as echo args",
	},
	{
		cmd: 'echo "cargo test"',
		shouldBlock: false,
		note: "inside double-quoted string",
	},
	{
		cmd: "echo 'cargo test'",
		shouldBlock: false,
		note: "inside single-quoted string",
	},
	{
		cmd: "cat cargo/test.md",
		shouldBlock: false,
		note: "path containing cargo/test",
	},
	{
		cmd: "cargo-test",
		shouldBlock: false,
		note: "binary called cargo-test",
	},
	{
		cmd: "cargo-test --help",
		shouldBlock: false,
		note: "cargo-test with args",
	},
	{
		cmd: "mise run test -- cargo test",
		shouldBlock: false,
		note: "after -- end-of-options",
	},
	{
		cmd: "printf 'cargo test'",
		shouldBlock: false,
		note: "printf with cargo test string",
	},
	{
		cmd: 'echo "running cargo test now"',
		shouldBlock: false,
		note: "quoted string containing cargo test",
	},
	{
		cmd: "git commit -m 'cargo test'",
		shouldBlock: false,
		note: "git commit message",
	},
	{
		cmd: "echo { cargo test }",
		shouldBlock: false,
		note: "echo with braces (not a group)",
	},
	{
		cmd: "export CARGO_TARGET_DIR=/tmp",
		shouldBlock: false,
		note: "export without command",
	},
	{
		cmd: "grep -r 'cargo test' .",
		shouldBlock: false,
		note: "grep searching for string",
	},
	{
		cmd: "git log --grep='cargo test'",
		shouldBlock: false,
		note: "git log grep",
	},
	{
		cmd: "sed -i 's/cargo test/mise test/' Makefile",
		shouldBlock: false,
		note: "sed replacement content",
	},

	// ── Known gaps (indirect execution — not caught, acceptable) ──
	{
		cmd: "timeout 30 cargo test",
		shouldBlock: false,
		note: "timeout with duration (acceptable gap)",
	},
	{
		cmd: "docker run --rm cargo test",
		shouldBlock: false,
		note: "docker (indirect, acceptable gap)",
	},
	{
		cmd: "ssh localhost cargo test",
		shouldBlock: false,
		note: "ssh (indirect, acceptable gap)",
	},
	{
		cmd: 'python3 -c "import os; os.system(\'cargo test\')"',
		shouldBlock: false,
		note: "python exec (indirect, acceptable gap)",
	},
	{
		cmd: "nix develop -c cargo test",
		shouldBlock: false,
		note: "nix (indirect, acceptable gap)",
	},

	// ── newline = separate commands ──
	// shell-parse flattens bare newlines, so cargo\ntest becomes ["cargo","test"] → matches.
	{ cmd: "cargo\ntest", shouldBlock: true, note: "newline flattened into one token stream" },
];

// ── Runner ──

let passed = 0;
let failed = 0;

for (const tc of cases) {
	const blocked = checkCommand(tc.cmd, policies) !== null;
	const ok = blocked === tc.shouldBlock;

	if (!ok) {
		failed++;
		console.log(`✗ [FAIL] ${tc.note}`);
		console.log(`   cmd:      ${JSON.stringify(tc.cmd)}`);
		console.log(`   expected: ${tc.shouldBlock ? "BLOCK" : "ALLOW"}, got: ${blocked ? "BLOCK" : "ALLOW"}`);
		console.log();
	} else {
		passed++;
	}
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
