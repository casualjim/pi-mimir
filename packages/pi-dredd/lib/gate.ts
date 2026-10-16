/**
 * The action gate: every guarded tool call passes the offline floor first
 * (static danger patterns, no key needed), then one judge request carrying
 * the core questions, any configured policies, and the user-registered
 * questions with appliesTo "call". A hold is the only blocking outcome;
 * warns and records never block. Fail-open everywhere: judge errors pass
 * the call through with a ledger row.
 */

/** Static floor patterns: held with no key, no request. */
const FLOOR: ReadonlyArray<{ id: string; test: RegExp; reason: string }> = [
	{ id: "force-push", test: /push\s+(?:--force\b|--force-with-lease\b|-f\b)/, reason: "force push rewrites remote history" },
	{ id: "reset-hard", test: /git\s+reset\s+--hard\b/, reason: "reset --hard discards uncommitted work" },
	{ id: "rm-rf-root", test: /rm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+(?:\/|~\s*$|~\/$|\$HOME)/, reason: "recursive delete at or above home" },
	{ id: "drop-table", test: /\bDROP\s+(?:TABLE|DATABASE)\b/i, reason: "DROP destroys schema or data" },
	{ id: "chmod-777", test: /chmod\s+(?:-R\s+)?777\b/, reason: "world-writable permissions" },
	{ id: "curl-pipe-shell", test: /(?:curl|wget)[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da|k|a)?sh\b/, reason: "remote script piped straight into a shell" },
];

export interface FloorHit {
	id: string;
	reason: string;
}

export interface GateVerdict {
	level: "allow" | "warn" | "hold";
	reasons: string[];
	/** Where the verdict came from. */
	source: "floor" | "judge" | "error" | "skip";
	/** The answers as returned, for the ledger. */
	scores: Record<string, number>;
}

/** Commands that only read; they never ask the judge under strict/balanced. */
const READ_ONLY_HEADS = new Set([
	"ls", "cat", "head", "tail", "grep", "rg", "find", "fd", "echo", "pwd", "which", "type",
	"jq", "wc", "sort", "uniq", "diff", "stat", "file", "du", "df",
]);

/** Heads whose read-only nature depends on the subcommand. */
const READ_ONLY_SUBCOMMANDS: Record<string, ReadonlySet<string>> = {
	git: new Set(["status", "log", "diff", "show", "branch", "list", "view", "config", "rev-parse", "ls-files", "blame"]),
	cargo: new Set(["check", "test", "build", "tree", "metadata", "search"]),
	npm: new Set(["test", "run", "ls", "view", "outdated", "audit"]),
	pnpm: new Set(["test", "run", "ls", "view", "outdated"]),
	bun: new Set(["test", "run"]),
	node: new Set(["--version", "--check"]),
	python3: new Set(["--version", "-c"]),
	tsc: new Set(["--noEmit", "--version", "--showConfig"]),
	print: new Set([]),
};

/** True when the whole command only reads. `strict`/`balanced` skip the judge for these. */
export function isReadOnlyCommand(command: string): boolean {
	const segments = command.split(/\n|;|&&|\|\||\||&/).map(s => s.trim()).filter(Boolean);
	if (segments.length === 0) return false;
	return segments.every(segment => {
		const words = segment.split(/\s+/);
		let head = words[0] ?? "";
		if (segment.match(/(?:^|[\s>&])>{1,2}(?![&<(])/) || segment.includes(">>")) return false;
		while (words.length > 1 && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head) || head === "sudo" || head === "nohup" || head === "time" || head === "command" || head === "nice")) {
			words.shift();
			head = words[0] ?? "";
		}
		if (READ_ONLY_HEADS.has(head)) return true;
		const allowed = READ_ONLY_SUBCOMMANDS[head];
		if (allowed === undefined) return false;
		const sub = words[1];
		return sub !== undefined && allowed.has(sub);
	});
}

export function floorCheck(command: string): FloorHit[] {
	return FLOOR.filter(f => f.test.test(command)).map(f => ({ id: f.id, reason: f.reason }));
}

/** The core gate questions, ohmyjev BASH_Q shape. */
export function gateQuestions(): Record<string, import("./jev").Question> {
	return {
		irreversible: { type: "noul", instructions: "Would nothing restore what this command removes, overwrites, or rewrites?" },
		destructive: { type: "noul", instructions: "Does this command delete, overwrite, or destroy files, data, history, or state?" },
		sendsOut: { type: "noul", instructions: "Does this command send the user's files, credentials, or keys anywhere outside this machine?" },
	};
}

export const HOLD_THRESHOLD = 0.9;
export const WARN_THRESHOLD = 0.5;

/**
 * Fold judge answers into a verdict. Policies and registered questions land
 * here too: any answer at or above its threshold is a reason; the highest
 * single score decides warn vs hold per the thresholds.
 */
export function foldVerdict(
	answers: import("./jev").Answers,
	extras: Array<{ finding: string; score: number; hold: boolean }>,
): GateVerdict {
	const scores: Record<string, number> = {};
	const reasons: string[] = [];
	for (const [id, answer] of Object.entries(answers)) {
		if (answer.type === "noul") scores[id] = answer.noul;
		else if (answer.type === "score") scores[id] = answer.score / 10;
		else scores[id] = answer.confidence;
	}
	let worst = 0;
	let hold = false;
	for (const [id, score] of Object.entries(scores)) {
		if (score >= HOLD_THRESHOLD) {
			hold = true;
			reasons.push(`${id}: ${score.toFixed(2)}`);
			worst = Math.max(worst, score);
		} else if (score >= WARN_THRESHOLD) {
			reasons.push(`${id}: ${score.toFixed(2)} (warn)`);
			worst = Math.max(worst, score);
		}
	}
	for (const extra of extras) {
		scores[extra.finding] = extra.score;
		reasons.push(`${extra.finding} (score ${extra.score})`);
		if (extra.hold) hold = true;
		worst = Math.max(worst, extra.score);
	}
	if (hold) return { level: "hold", reasons, source: "judge", scores };
	if (worst >= WARN_THRESHOLD) return { level: "warn", reasons, source: "judge", scores };
	return { level: "allow", reasons, source: "judge", scores };
}