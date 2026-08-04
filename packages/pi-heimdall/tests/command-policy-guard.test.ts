/**
 * Test harness for command-policy-guard.
 * Run with: bun tests/command-policy-guard.test.ts
 */

import { checkCommand } from "../lib/guards/command-policy-guard.js";
import type { CommandPolicy } from "../lib/types.js";

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
	{
		name: "bare-kubectl-apply",
		blocked: ["kubectl", "apply"],
		bare: true,
		message: "kubectl apply must run bare; no pipe or redirect.",
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

	// ── Newlines are command separators ──
	{ cmd: "echo foo\ncargo test", shouldBlock: true, note: "newline separates commands" },
	{ cmd: "cd /repo/base/root\ncargo test -p some-project", shouldBlock: true, note: "newline after cd (reported bypass)" },
	{ cmd: "echo hi &&\ncargo test", shouldBlock: true, note: "newline after && continuation" },
	{ cmd: "cargo test\necho done", shouldBlock: true, note: "blocked command on first line" },
	{ cmd: "cargo\ntest", shouldBlock: false, note: "newline splits the sequence: `cargo` then `test` builtin, cargo test never runs" },

	// ── Comments are line-scoped ──
	{ cmd: "echo hi # note\ncargo test", shouldBlock: true, note: "command hidden after a comment line" },
	{ cmd: "echo hi\ncargo test # trailing comment", shouldBlock: true, note: "blocked command with trailing comment" },
	{ cmd: "# cargo test\necho hi", shouldBlock: false, note: "blocked tokens inside a full-line comment" },
	{ cmd: "echo $#\ncargo test", shouldBlock: true, note: "mid-word # ($#) does not start a comment" },

	// ── Shell control keywords ──
	{ cmd: "for i in 1; do cargo test; done", shouldBlock: true, note: "for loop body on one line" },
	{ cmd: "for i in 1\ndo\n  cargo test\ndone", shouldBlock: true, note: "multiline for loop" },
	{ cmd: "if true; then cargo test; fi", shouldBlock: true, note: "if-then body" },
	{ cmd: "! cargo test", shouldBlock: true, note: "negation prefix" },
	{ cmd: "while false; do cargo test; done", shouldBlock: true, note: "while loop body" },

	// ── Quoted newlines stay data ──
	{ cmd: "echo \"foo\ncargo test\"", shouldBlock: false, note: "newline inside double quotes" },
	{ cmd: "printf 'cargo test\n'", shouldBlock: false, note: "newline inside single quotes" },
	{ cmd: "cd /x \\\n&& cargo test", shouldBlock: true, note: "line continuation then &&" },

	// ── Heredoc bodies stay data ──
	{ cmd: "cat <<EOF\ncargo test\nEOF", shouldBlock: false, note: "heredoc content" },
	{ cmd: "cat > script.sh <<'EOF'\ncargo test\nEOF", shouldBlock: false, note: "heredoc to file" },
	{ cmd: "cat <<EOF\ncargo test\nEOF\ncargo test", shouldBlock: true, note: "blocked command after heredoc ends" },
	{ cmd: "cat <<-EOF\n\tcargo test\n\tEOF", shouldBlock: false, note: "<<- heredoc with tab indent" },

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
	{
		cmd: "bash -c \"cd /x\ncargo test\"",
		shouldBlock: true,
		note: "newline bypass inside bash -c string",
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

	// ── mise exec/x passthrough ──
	{
		cmd: "mise exec -- cargo test -p crumbs-indexer -- stages::aggregate::tests 2>&1 | tail -15",
		shouldBlock: true,
		note: "mise exec -- unwraps to real cargo test",
	},
	{
		cmd: "mise x -- cargo test",
		shouldBlock: true,
		note: "mise x -- alias unwraps too",
	},
	{
		cmd: "mise exec cargo test",
		shouldBlock: true,
		note: "mise exec without -- still unwraps",
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

	// ── Bare requirement (bare: true policy) ──
	{ cmd: "kubectl apply -f foo.yaml", shouldBlock: false, note: "bare policy: bare invocation allowed" },
	{ cmd: "kubectl apply -f foo.yaml | tee out", shouldBlock: true, note: "bare policy: piped blocked" },
	{ cmd: "kubectl apply -f foo.yaml > out", shouldBlock: true, note: "bare policy: stdout redirect blocked" },
	{ cmd: "kubectl apply -f foo.yaml 2>&1", shouldBlock: true, note: "bare policy: stderr redirect blocked" },
	{ cmd: "kubectl apply -f foo.yaml 2>/dev/null", shouldBlock: true, note: "bare policy: stderr suppress blocked" },
	{ cmd: "echo hi | kubectl apply -f foo.yaml", shouldBlock: false, note: "bare policy: pipe-input allowed (output-side only)" },
	{ cmd: "kubectl apply -f foo.yaml < input.txt", shouldBlock: false, note: "bare policy: input redirect allowed" },
	{ cmd: "kubectl apply -f foo.yaml; echo hi", shouldBlock: false, note: "bare policy: semicolon keeps bare" },
	{ cmd: "kubectl apply -f foo.yaml && echo hi", shouldBlock: false, note: "bare policy: && keeps bare" },
	{ cmd: "kubectl apply -f foo.yaml\necho hi", shouldBlock: false, note: "bare policy: newline keeps bare" },
	{ cmd: "kubectl apply -f foo.yaml | tee\necho hi", shouldBlock: true, note: "bare policy: pipe on first line blocked" },
	{ cmd: "bash -c 'kubectl apply -f foo.yaml | tee'", shouldBlock: true, note: "bare policy: pipe inside bash -c blocked" },
	{ cmd: "bash -c 'kubectl apply -f foo.yaml' | tee", shouldBlock: true, note: "bare policy: outer pipe via bash -c blocked" },

	// ── Bare policy: blocked tokens after wrapper args (subsequence) ──
	{ cmd: "timeout 900 kubectl apply -f foo.yaml", shouldBlock: false, note: "bare policy: wrapper args, still bare → allowed" },
	{ cmd: "timeout 900 kubectl apply -f foo.yaml | tee out", shouldBlock: true, note: "bare policy: wrapper args + pipe blocked" },
	{ cmd: "timeout 900 kubectl apply -f foo.yaml 2>&1 | tail -15", shouldBlock: true, note: "bare policy: wrapper args + redirect+pipe blocked" },
	{ cmd: "cd /x && timeout 900 kubectl apply -f foo.yaml 2>&1 | tail -15", shouldBlock: true, note: "bare policy: cd prefix + wrapper args + pipe blocked" },
	{ cmd: "echo kubectl apply", shouldBlock: false, note: "bare policy: as echo data, bare → allowed" },

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
