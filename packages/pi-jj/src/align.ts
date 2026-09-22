// Merged from https://github.com/ProbabilityEngineer/pi-jj-git-align (MIT)
// jj_vcs status/align_push, /jj-ensure, /jj-status, /jj-align-push, AGENTS.md guidance block.
// Renamed from jj-init to jj-ensure to avoid colliding with this package's colocated jj-init.

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ensureJjScript = join(here, "..", "scripts", "ensure-jj.sh");
const disableMarker = ".pi-jujutsu-status-off";
const agentsJjBlockStart = "<!-- pi-jj-git-align:jjtips:start -->";
const agentsJjBlockEnd = "<!-- pi-jj-git-align:jjtips:end -->";
const agentsJjGuidance = `${agentsJjBlockStart}
## Jujutsu Version Control
- Use JJ for local work: \`jj status\`, \`jj diff\`, \`jj log\`, \`jj describe -m "message"\`, \`jj new <bookmark>\`, \`jj op log\`, and \`jj undo\`.
- Do not use Git staged-index workflows: no \`git add\`, \`git commit\`, \`git diff --cached\`, or \`git pull --rebase\`.
- After completing coherent agent-owned work in \`@\`, run \`jj describe -m "message"\`, move the target bookmark to \`@\`, then run \`jj new <bookmark>\` so \`@\` becomes an empty working-copy change and \`@-\` is the completed change.
- Avoid the footgun sequence \`jj new --no-edit\` followed by moving a bookmark to \`@-\` unless you have verified that \`@-\` is actually the completed change.
- Before declaring work pushed or clean, verify publish alignment: \`@\` is empty, \`@-\` is the completed change, the target bookmark plus \`<branch>@git\` and \`<branch>@origin\` point to \`@-\`, Git HEAD is attached to the branch, and \`git status --short --branch\` is clean.
- If \`jj status\` is dirty before you start, treat it as pre-existing user work unless explicitly told to continue it.
- For off-machine backup or publishing, prefer \`/jj-align-push [branch]\`; it can finish dirty described \`@\` by moving the bookmark to \`@\` and creating a fresh empty \`@\` on that bookmark.
${agentsJjBlockEnd}`;

type ChangeCounts = { added: number; modified: number; removed: number };
type RevInfo = {
	changeId: string;
	commitId: string;
	description: string;
	bookmarks: string[];
};

type StatusContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		setStatus: (key: string, text: string | undefined) => void;
		setWidget: (
			key: string,
			lines: string[] | undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		) => void;
		theme: { fg: (color: "warning", text: string) => string };
	};
};

function run(cmd: string, args: string[], cwd: string): string | null {
	try {
		return execFileSync(cmd, args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 5000,
		}).trim();
	} catch {
		return null;
	}
}

function runJj(args: string[], cwd: string): string | null {
	return run("jj", args, cwd);
}

function runJjRead(args: string[], cwd: string): string | null {
	return run("jj", ["--ignore-working-copy", ...args], cwd);
}

function runGit(args: string[], cwd: string): string | null {
	return run("git", args, cwd);
}

function formatChangeSummary({
	added,
	modified,
	removed,
}: ChangeCounts): string {
	const parts: string[] = [];
	if (added) parts.push(`+${added}`);
	if (modified) parts.push(`~${modified}`);
	if (removed) parts.push(`-${removed}`);
	return parts.length > 0 ? parts.join("") : "clean";
}

function truncate(value: string, max = 44): string {
	return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function parseBookmarkNames(raw: string): string[] {
	return raw
		.split(/[\s,]+/)
		.map((part) => part.trim().replace(/[*:]+$/g, ""))
		.filter(Boolean);
}

function currentGitBranch(cwd: string): string | null {
	return runGit(["branch", "--show-current"], cwd);
}

function hasJjRepo(cwd: string): boolean {
	return runJjRead(["root"], cwd) !== null;
}

function alignedRemoteBookmarksByLocal(
	cwd: string,
	commitId: string,
): Map<string, string[]> {
	const raw = runJjRead(["bookmark", "list", "--all"], cwd);
	const byLocal = new Map<string, string[]>();
	if (!raw) return byLocal;

	let localBookmark: string | null = null;
	for (const line of raw.split(/\r?\n/)) {
		const localMatch = line.match(/^(\S+):\s+\S+\s+(\S+)/);
		if (localMatch) {
			localBookmark = localMatch[1];
			continue;
		}

		const remoteMatch = line.match(/^\s+@([^:]+):\s+\S+\s+(\S+)/);
		if (!remoteMatch || !localBookmark) continue;
		const [, remote, remoteCommitId] = remoteMatch;
		if (remote === "git" || !commitId.startsWith(remoteCommitId)) continue;
		const names = byLocal.get(localBookmark) ?? [];
		names.push(`${localBookmark}@${remote}`);
		byLocal.set(localBookmark, names);
	}

	return byLocal;
}

function revInfo(cwd: string, rev: string): RevInfo | null {
	const changeId = runJjRead(
		["log", "-r", rev, "--no-graph", "-T", "change_id.short()"],
		cwd,
	);
	if (changeId === null) return null;
	const commitId =
		runJjRead(["log", "-r", rev, "--no-graph", "-T", "commit_id.short()"], cwd) ??
		"?";
	const rawDescription =
		runJjRead(["log", "-r", rev, "--no-graph", "-T", "description"], cwd) ?? "";
	const description = rawDescription.trim()
		? truncate(rawDescription.trim().split(/\r?\n/)[0])
		: "no desc";
	const localBookmarks = parseBookmarkNames(
		runJjRead(["log", "-r", rev, "--no-graph", "-T", "bookmarks"], cwd) ?? "",
	);
	const alignedRemotes = alignedRemoteBookmarksByLocal(cwd, commitId);
	const bookmarks = Array.from(
		new Set(
			localBookmarks.flatMap((bookmark) => [
				bookmark,
				...(alignedRemotes.get(bookmark) ?? []),
			]),
		),
	);
	return { changeId, commitId, description, bookmarks };
}

function countJjChanges(cwd: string): ChangeCounts {
	const status = runJjRead(["status", "--no-pager"], cwd) ?? "";
	const counts = { added: 0, modified: 0, removed: 0 };
	for (const line of status.split(/\r?\n/)) {
		if (line.startsWith("A ")) counts.added += 1;
		else if (line.startsWith("M ")) counts.modified += 1;
		else if (line.startsWith("R ") || line.startsWith("D "))
			counts.removed += 1;
	}
	return counts;
}

function isDirty(counts: ChangeCounts): boolean {
	return counts.added + counts.modified + counts.removed > 0;
}

function firstBookmark(info: RevInfo | null): string | undefined {
	return info?.bookmarks[0];
}

function resolveTargetBranch(
	cwd: string,
	current: RevInfo | null,
	parked: RevInfo | null,
): string | null {
	const gitBranch = currentGitBranch(cwd)?.trim();
	if (gitBranch) return gitBranch;
	return firstBookmark(current) ?? firstBookmark(parked) ?? null;
}

function sameCommit(left: RevInfo | null, right: RevInfo | null): boolean {
	return Boolean(left && right && left.commitId === right.commitId);
}

function alignmentWarnings(cwd: string, branch: string | null, parked: RevInfo | null, dirty: boolean): string[] {
	const warnings: string[] = [];
	if (dirty) return warnings;
	if (!parked || !branch) return warnings;

	const branchInfo = revInfo(cwd, branch);
	if (branchInfo && !sameCommit(branchInfo, parked)) warnings.push(`${branch}≠@-`);

	const gitBookmark = revInfo(cwd, `${branch}@git`);
	if (gitBookmark && !sameCommit(gitBookmark, parked)) warnings.push(`${branch}@git≠@-`);

	const originBookmark = revInfo(cwd, `${branch}@origin`);
	if (originBookmark && !sameCommit(originBookmark, parked)) warnings.push(`${branch}@origin≠@-`);

	const gitBranch = currentGitBranch(cwd)?.trim();
	if (!gitBranch) warnings.push("git HEAD detached");
	else if (gitBranch !== branch) warnings.push(`git HEAD≠${branch}`);

	return warnings;
}

function isValidBranchName(cwd: string, branch: string): boolean {
	return runGit(["check-ref-format", "--branch", branch], cwd) !== null;
}

function attachGitHead(cwd: string, branch: string): boolean {
	return runGit(["symbolic-ref", "HEAD", `refs/heads/${branch}`], cwd) !== null;
}

function buildJjStatus(
	cwd: string,
	sessionStart?: { changeId: string; dirty: boolean },
): { text: string; dirty: boolean; warning: boolean } | undefined {
	const current = revInfo(cwd, "@");
	if (!current) return undefined;
	const parked = revInfo(cwd, "@-");
	const counts = countJjChanges(cwd);
	const dirty = isDirty(counts);
	const statusText = formatChangeSummary(counts);
	const currentBookmark = current.bookmarks.join(",");
	const parkedBookmark = parked?.bookmarks.join(",") ?? "";
	const branch = resolveTargetBranch(cwd, current, parked);
	const branchHasBookmark =
		!branch ||
		current.bookmarks.includes(branch) ||
		parked?.bookmarks.includes(branch);
	const bookmarkWarning = !branchHasBookmark;
	const preexistingDirty = Boolean(
		dirty && sessionStart?.dirty && sessionStart.changeId === current.changeId,
	);
	const alignment = alignmentWarnings(cwd, branch, parked, dirty);
	const warningParts = [
		...(bookmarkWarning ? [`bkmrk≠${branch}`] : []),
		...(preexistingDirty ? ["preexisting dirty"] : []),
		...alignment,
	];
	const warningText = warningParts.join(" · ");

	const parkedText = parked
		? `@- ${parkedBookmark || "no bkmrk"} · ${parked.description !== "no desc" ? `"${parked.description}"` : "no desc"}`
		: "@- none";
	const currentText = dirty
		? `@ ${currentBookmark || "no bkmrk"} · ${current.description !== "no desc" ? `"${current.description}"` : "no desc"}`
		: `@ ${currentBookmark || "no bkmrk"}`;

	return {
		text: `${parkedText} · ${currentText} · ${statusText}${warningText ? ` · ${warningText}` : ""}`,
		dirty,
		warning: bookmarkWarning || preexistingDirty || alignment.length > 0,
	};
}

function statusDisabled(cwd: string): boolean {
	return existsSync(join(cwd, disableMarker));
}

function setStatusEnabled(cwd: string, enabled: boolean): string {
	const marker = join(cwd, disableMarker);
	if (enabled) {
		try {
			unlinkSync(marker);
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
				throw error;
			}
		}
		return "jj statusline enabled";
	}
	writeFileSync(marker, "disabled\n");
	return "jj statusline disabled";
}

function toggleStatus(cwd: string): string {
	return setStatusEnabled(cwd, statusDisabled(cwd));
}

function initJj(cwd: string): string {
	const hasJj = run("jj", ["--version"], cwd) !== null;
	if (!hasJj) return "jj is not installed";
	if (existsSync(join(cwd, ".jj"))) return "jj already initialized";
	const result = run("bash", [ensureJjScript, cwd], cwd);
	return result ?? "jj setup failed";
}

function ensureAgentsGuidance(cwd: string): string {
	const path = join(cwd, "AGENTS.md");
	const existing = existsSync(path)
		? readFileSync(path, "utf8")
		: "# Agent Instructions\n";
	let next: string;
	if (
		existing.includes(agentsJjBlockStart) &&
		existing.includes(agentsJjBlockEnd)
	) {
		next = existing.replace(
			new RegExp(`${agentsJjBlockStart}[\\s\\S]*?${agentsJjBlockEnd}`),
			agentsJjGuidance,
		);
	} else if (existing.includes("## Jujutsu Version Control")) {
		next = existing.replace(
			/## Jujutsu Version Control[\s\S]*?(?=\n## |\n<!-- END AGENT GUIDANCE -->|$)/,
			agentsJjGuidance,
		);
	} else {
		const suffix = existing.endsWith("\n") ? "" : "\n";
		next = `${existing}${suffix}\n${agentsJjGuidance}\n`;
	}
	if (next !== existing) {
		writeFileSync(path, next);
		return "AGENTS.md JJ guidance updated";
	}
	return "AGENTS.md JJ guidance already current";
}

function joinArgs(args: unknown): string {
	if (typeof args === "string") return args.trim();
	if (Array.isArray(args)) return args.map(String).join(" ").trim();
	return "";
}

function summarizeOutput(output: string | null, maxLines = 12): string {
	if (!output) return "";
	return output.split(/\r?\n/).filter(Boolean).slice(0, maxLines).join("\n");
}

function parseBookmarkCommand(
	args: unknown,
): { branch: string; rev: string } | null {
	const parts = joinArgs(args).split(/\s+/).filter(Boolean);
	const branch = parts[0];
	if (!branch) return null;
	return { branch, rev: parts[1] ?? "@-" };
}

async function confirm(
	ctx: {
		ui: { confirm?: (title: string, message: string) => Promise<boolean> };
	},
	title: string,
	message: string,
): Promise<boolean> {
	if (!ctx.ui.confirm) return true;
	return ctx.ui.confirm(title, message);
}

function publishStatus(cwd: string): { text: string; ok: boolean; branch: string | null } {
	const current = revInfo(cwd, "@");
	const parked = revInfo(cwd, "@-");
	const counts = countJjChanges(cwd);
	const dirty = isDirty(counts);
	const branch = resolveTargetBranch(cwd, current, parked);
	const warnings = alignmentWarnings(cwd, branch, parked, dirty);
	const lines = [
		"JJ publish alignment",
		`@ dirty: ${dirty ? formatChangeSummary(counts) : "no"}`,
		`@: ${current ? `${current.changeId} ${current.commitId} ${current.bookmarks.join(",") || "no bookmark"}` : "unavailable"}`,
		`@-: ${parked ? `${parked.changeId} ${parked.commitId} ${parked.bookmarks.join(",") || "no bookmark"} ${parked.description}` : "unavailable"}`,
		`branch: ${branch ?? "none"}`,
		`git HEAD: ${currentGitBranch(cwd)?.trim() || "detached"}`,
	];
	if (warnings.length) lines.push(`warnings: ${warnings.join("; ")}`);
	else lines.push("warnings: none");
	const ok = !dirty && Boolean(branch && parked) && warnings.length === 0;
	lines.push(`aligned: ${ok ? "yes" : "no"}`);
	return { text: lines.join("\n"), ok, branch };
}

function alignPush(cwd: string, explicitBranch?: string): string {
	const current = revInfo(cwd, "@");
	const parked = revInfo(cwd, "@-");
	const counts = countJjChanges(cwd);
	const dirty = isDirty(counts);
	const branch = explicitBranch?.trim() || resolveTargetBranch(cwd, current, parked);
	if (!branch) throw new Error("No Git branch or JJ bookmark found. Provide branch.");
	if (!isValidBranchName(cwd, branch)) throw new Error(`Invalid Git branch name: ${branch}`);
	const targetRev = dirty ? "@" : "@-";
	const target = dirty ? current : parked;
	if (!target) throw new Error(`No ${targetRev} target found for alignment.`);
	const exists = runJj(["bookmark", "list", branch], cwd);
	const bookmarkResult = exists && exists.includes(`${branch}:`)
		? runJj(["bookmark", "move", branch, "--to", targetRev], cwd)
		: runJj(["bookmark", "create", branch, "-r", targetRev], cwd);
	if (!bookmarkResult) throw new Error("jj bookmark update failed");
	if (dirty && runJj(["new", branch], cwd) === null) throw new Error(`jj new ${branch} failed`);
	if (runJj(["git", "export"], cwd) === null) throw new Error("jj git export failed");
	if (!attachGitHead(cwd, branch)) throw new Error(`Attaching Git HEAD to ${branch} failed`);
	const pushResult = runGit(["push", "origin", branch], cwd);
	if (pushResult === null) throw new Error(`git push origin ${branch} failed`);
	if (runJj(["git", "import"], cwd) === null) throw new Error("jj git import failed");
	return [
		`Aligned and pushed ${branch}.`,
		publishStatus(cwd).text,
	].join("\n\n");
}

const jjVcsTool = defineTool({
	name: "jj_vcs",
	label: "JJ VCS",
	description: "Jujutsu/GitHub publish alignment: status or align_push.",
	parameters: Type.Object({
		action: Type.Union([Type.Literal("status"), Type.Literal("align_push")]),
		branch: Type.Optional(Type.String({ description: "Branch/bookmark to align and push; defaults to the current Git branch, then a bookmark on @ or @-." })),
	}),
	async execute(_toolCallId, params, _signal, _updates, ctx) {
		const p = params as { action: "status" | "align_push"; branch?: string };
		const text = p.action === "status" ? publishStatus(ctx.cwd).text : alignPush(ctx.cwd, p.branch);
		return { content: [{ type: "text" as const, text }], details: { action: p.action } };
	},
});

export function registerAlign(pi: ExtensionAPI) {
	let lastRendered: string | undefined;
	let sessionStart: { changeId: string; dirty: boolean } | undefined;
	let pollCtx: StatusContext | undefined;
	let pollTimer: ReturnType<typeof setInterval> | undefined;

	pi.registerTool(jjVcsTool);

	const refresh = (ctx: StatusContext) => {
		if (!ctx.hasUI) return;
		if (statusDisabled(ctx.cwd)) {
			if (lastRendered !== undefined) {
				lastRendered = undefined;
				ctx.ui.setWidget("jj-status", undefined);
				ctx.ui.setStatus("jj-status", undefined);
			}
			return;
		}
		if (!hasJjRepo(ctx.cwd)) {
			if (lastRendered !== undefined) {
				lastRendered = undefined;
				ctx.ui.setWidget("jj-status", undefined);
				ctx.ui.setStatus("jj-status", undefined);
			}
			return;
		}
		startPolling(ctx);

		const next = buildJjStatus(ctx.cwd, sessionStart);
		const rendered = next
			? next.dirty || next.warning
				? `${ctx.ui.theme.fg("warning", next.text)}\x1b[0m`
				: next.text
			: undefined;
		if (rendered === lastRendered) return;
		lastRendered = rendered;
		ctx.ui.setWidget("jj-status", rendered ? [rendered] : undefined, {
			placement: "aboveEditor",
		});
		ctx.ui.setStatus("jj-status", undefined);
	};

	const stopPolling = () => {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = undefined;
		}
		pollCtx = undefined;
	};

	const startPolling = (ctx: StatusContext) => {
		if (!ctx.hasUI || !hasJjRepo(ctx.cwd)) {
			stopPolling();
			return;
		}
		pollCtx = ctx;
		if (pollTimer) return;
		pollTimer = setInterval(() => {
			if (!pollCtx?.hasUI) return;
			refresh(pollCtx);
		}, 5000);
	};

	pi.registerCommand("jj-ensure", {
		description: "Install/setup jj for the current repo and refresh the AGENTS.md guidance block",
		handler: async (_args, ctx) => {
			const result = initJj(ctx.cwd);
			const guidanceResult =
				result.includes("not installed") || result.includes("failed")
					? ""
					: `\n${ensureAgentsGuidance(ctx.cwd)}`;
			ctx.ui.notify(
				`${result}${guidanceResult}`,
				result.includes("failed") || result.includes("not installed")
					? "warning"
					: "info",
			);
			refresh(ctx);
		},
	});

	pi.registerCommand("jj-status", {
		description: "Toggle the JJ statusline on/off. Optional: /jj-status on|off|toggle",
		handler: async (args, ctx) => {
			const mode = joinArgs(args).toLowerCase();
			try {
				const result = mode === "on" || mode === "enable"
					? setStatusEnabled(ctx.cwd, true)
					: mode === "off" || mode === "disable"
						? setStatusEnabled(ctx.cwd, false)
						: toggleStatus(ctx.cwd);
				ctx.ui.notify(result, "info");
			} catch (error) {
				ctx.ui.notify(
					`jj statusline toggle failed: ${error instanceof Error ? error.message : String(error)}`,
					"warning",
				);
			}
			refresh(ctx);
		},
	});

	pi.registerCommand("jj-align-push", {
		description:
			"Confirm, align bookmark, export/import Git, attach Git HEAD, and push the current Git branch or resolved bookmark",
		handler: async (args, ctx) => {
			const explicitBranch = joinArgs(args).split(/\s+/).filter(Boolean)[0];
			const current = revInfo(ctx.cwd, "@");
			const parked = revInfo(ctx.cwd, "@-");
			const counts = countJjChanges(ctx.cwd);
			const dirty = isDirty(counts);
			const branch = explicitBranch ?? resolveTargetBranch(ctx.cwd, current, parked);
			if (!branch) {
				ctx.ui.notify(
					"No Git branch or JJ bookmark found. Provide /jj-align-push <branch>.",
					"warning",
				);
				return;
			}
			if (!isValidBranchName(ctx.cwd, branch)) {
				ctx.ui.notify(`Invalid Git branch name: ${branch}`, "warning");
				return;
			}
			const targetRev = dirty ? "@" : "@-";
			const target = dirty ? current : parked;
			if (!target) {
				ctx.ui.notify(`No JJ ${targetRev} target found for alignment`, "warning");
				return;
			}
			const ok = await confirm(
				ctx,
				"Align and push to GitHub?",
				`Move/create bookmark ${branch} at ${targetRev} ${target.changeId} "${target.description}"${dirty ? `, run jj new ${branch}` : ""}, export/import Git, attach Git HEAD to ${branch}, and run git push origin ${branch}?`,
			);
			if (!ok) return;
			try {
				ctx.ui.notify(alignPush(ctx.cwd, branch), "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
			}
			refresh(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const current = revInfo(ctx.cwd, "@");
		if (current) {
			sessionStart = {
				changeId: current.changeId,
				dirty: isDirty(countJjChanges(ctx.cwd)),
			};
		}
		refresh(ctx);
		startPolling(ctx);
	});
	pi.on("turn_end", async (_event, ctx) => {
		refresh(ctx);
		startPolling(ctx);
	});
	pi.on("tool_result", async (event, ctx) => {
		if (["edit", "write", "bash"].includes(event.toolName)) {
			refresh(ctx);
			startPolling(ctx);
		}
	});
	pi.on("session_shutdown", async (_event, ctx) => {
		stopPolling();
		if (!ctx.hasUI) return;
		ctx.ui.setWidget("jj-status", undefined);
		ctx.ui.setStatus("jj-status", undefined);
	});
}
