/**
 * Lifecycle helpers for background jobs.
 *
 * Collects the cross-cutting concerns — completion notification, timeout
 * scheduling, terminal-state marking, and cleanup (kill) — in one place.
 * Monitoring (progress polling, stall detection) lives in monitoring.ts.
 */

import { statSync as fsStatSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
    isTerminalStatus,
    MAX_CONCURRENT_JOBS,
    type Job,
    type JobStatus,
    type UiContext,
} from "./types.ts";
import type { BackgroundRegistry } from "./state.ts";
import { killProcessTree, type SpawnExit } from "./spawn.ts";
import { atConcurrencyLimit, forget, renderSidebar } from "./registry.ts";
import { watchStalls } from "./monitoring.ts";
import { markNotified, sendTaskNotification } from "./notify.ts";

// --- Background-job orchestration ----------------------------------------

/** Throw a standard error when no concurrency slot is free. */
export function assertJobSlot(reg: BackgroundRegistry): void {
    if (atConcurrencyLimit(reg)) {
        throw new Error(
            `Max concurrent background jobs (${MAX_CONCURRENT_JOBS}) reached. ` +
                `Kill or wait for existing jobs before starting new ones.`
        );
    }
}

/**
 * Wire a background job's lifecycle: completion promise, abort controller,
 * stall watcher, and the exit→completeJob hand-off. The job must already be in
 * the registry. Returns the job's AbortController so callers can attach extra
 * monitors (e.g. agent_bg's progress poller).
 */
export function startBackgroundJob(args: {
    reg: BackgroundRegistry;
    pi: ExtensionAPI;
    ctx: UiContext;
    job: Job;
    exit: Promise<SpawnExit>;
    shouldNotify?: boolean;
    /** Suppress the interactive-prompt stall heuristic (monitors stream their
     *  own output, so a quiet tail is normal, not a stuck prompt). */
    disablePromptStall?: boolean;
    /** Suppress the oversize auto-kill (persistent log tails are expected to
     *  grow without bound). */
    disableOversizeKill?: boolean;
    onExit?: (result: SpawnExit) => void;
}): AbortController {
    ensureCompletionPromise(args.job);
    const jobAc = createJobAbort(args.reg, args.job.id);
    const cancelStall = watchStalls({
        jobId: args.job.id,
        command: args.job.command,
        name: args.job.name,
        logPath: args.job.logPath,
        pi: args.pi,
        disablePromptStall: args.disablePromptStall,
        disableOversizeKill: args.disableOversizeKill,
        onOversize: () => terminateJobSilently(args.reg, args.job),
    });
    jobAc.signal.addEventListener("abort", cancelStall, { once: true });
    void args.exit.then((result) => {
        args.onExit?.(result);
        completeJob({
            job: args.job,
            code: result.code,
            signal: result.signal,
            reg: args.reg,
            pi: args.pi,
            ctx: args.ctx,
            shouldNotify: args.shouldNotify,
        });
    });
    renderSidebar(args.reg, args.ctx);
    return jobAc;
}

// --- Terminal-state marking ----------------------------------------------

/**
 * Standard completion flow after a job exits — abortJob → markTerminal →
 * notify → renderSidebar. Shared by every tool's exit callback (bash,
 * bash_bg, agent_bg, monitor) as the canonical termination protocol.
 *
 * The notification is Claude Code's per-job <task-notification>, sent the
 * moment the job exits (see notify.ts). A successful send evicts the job
 * from the live registry (terminal + notified). Jobs whose outcome is
 * already known (killed silently, or read via jobs output/attach) skip the
 * notification and linger until the lazy sweep in `jobs list`. Monitors own
 * their terminal notification (monitor-session, shouldNotify: false) and are
 * evicted here once it has fired. A `shouldNotify: false` job (bash_bg
 * `notify: false`) is latched notified WITHOUT sending — "don't notify" IS
 * notified — so it evicts too and never lingers as a permanent entry.
 */
export function completeJob(args: {
    job: Job;
    code: number | null | undefined;
    /** The signal that killed the job, when it died by signal. */
    signal?: NodeJS.Signals | null;
    reg: BackgroundRegistry;
    pi: ExtensionAPI;
    ctx: UiContext;
    shouldNotify?: boolean;
}): void {
    if (isTerminalStatus(args.job.status)) return;
    // The caller passes the authoritative Job (the object held in the registry),
    // so no lookup is needed.
    const finished = args.job;
    abortJob(args.reg, finished.id);
    markTerminal(finished, statusFromExit(args.code, args.signal), args.code ?? undefined);
    if (args.shouldNotify !== false) {
        sendTaskNotification({ reg: args.reg, pi: args.pi, job: finished });
    } else {
        markNotified(finished);
        forget(args.reg, finished);
    }
    renderSidebar(args.reg, args.ctx);
}

/**
 * Mark a job terminal and resolve its donePromise. Idempotent — already-
 * terminal jobs are ignored. The proc reference is dropped explicitly for GC.
 */
export function markTerminal(
    job: Job,
    status: JobStatus,
    exitCode?: number
): void {
    if (isTerminalStatus(job.status)) {
        return;
    }
    job.status = status;
    job.exitCode = exitCode;
    delete job.proc;
    if (job.resolveDone) {
        job.resolveDone();
        delete job.resolveDone;
    }
    delete job.donePromise;
}

/** Map an exit result to a JobStatus: a signal death (external kill, OOM) is
 *  "killed" (CC marks these killed), exit code 0 is "completed", anything else
 *  is "failed". */
export function statusFromExit(
    code: number | null | undefined,
    signal?: NodeJS.Signals | null
): JobStatus {
    if (signal) return "killed";
    return code === 0 ? "completed" : "failed";
}

/**
 * Create a job's donePromise. This is the entry point that attach/log-wait
 * flows await for a result. Idempotent — does not recreate an existing promise.
 */
export function ensureCompletionPromise(job: Job): void {
    if (job.donePromise) return;
    let resolveDone: (() => void) | undefined;
    job.donePromise = new Promise<void>((resolve) => {
        resolveDone = resolve;
    });
    job.resolveDone = resolveDone;
}

/**
 * Mark a job "killed" and latch the notified flag, so the exit callback does
 * not emit a spurious completion notification on any termination path.
 * `markTerminal` flips status to "killed" first; `markNotified` then records
 * that the outcome needs no <task-notification> (Claude Code parity — a
 * deliberate kill is intentional cleanup the agent already knows about).
 */
export function markKilledSilently(job: Job): void {
    markTerminal(job, "killed");
    markNotified(job);
}

/** Kill a job quietly and abort its registered monitors/timers. The notified
 *  latch is set BEFORE the kill so the exit handler's notification is
 *  suppressed (Ctrl+Shift+X, jobs kill, session quit). */
export function terminateJobSilently(reg: BackgroundRegistry, job: Job): void {
    markNotified(job);
    terminateJob(job);
    markKilledSilently(job);
    abortJob(reg, job.id);
}

// --- Per-job abort (cleanup) ---------------------------------------------

/** Create an AbortController for a job. Aborting it cancels all monitors. */
export function createJobAbort(
    reg: BackgroundRegistry,
    jobId: string
): AbortController {
    const existing = reg.jobAborts.get(jobId);
    if (existing) return existing;
    const ac = new AbortController();
    reg.jobAborts.set(jobId, ac);
    return ac;
}

/** Abort all monitors for a job and remove the controller. */
export function abortJob(reg: BackgroundRegistry, jobId: string): void {
    const ac = reg.jobAborts.get(jobId);
    if (ac) {
        ac.abort();
        reg.jobAborts.delete(jobId);
    }
}

/**
 * Kill a job — SIGTERM the live process group if the proc handle is present,
 * otherwise signal the recorded PID directly (covers jobs whose proc handle
 * was already dropped).
 */
export function terminateJob(job: Job): void {
    // Monitors carry a transient teardown hook (follower + ws socket). A ws
    // monitor has pid 0, so the process-tree kill below is a no-op for it and
    // job.stop does the real work; a command monitor needs both.
    job.stop?.();
    // No liveness probe: killProcessTree already swallows ESRCH, and probing
    // first would be a TOCTOU race. killProcessTree itself guards pid <= 0.
    killProcessTree(job.proc?.pid ?? job.pid, "SIGTERM");
}

// --- Foreground backgrounding --------------------------------------------

/** Richer context for Ctrl+Shift+B / `/bg`: the UI plus the turn-control surface
 *  (idle check and whether a user message is already queued). */
export type ControlContext = UiContext & {
    isIdle(): boolean;
    hasPendingMessages(): boolean;
};

/**
 * Flip every running foreground command into the background — Claude Code's
 * Ctrl+B `backgroundAll`. Pure mechanic — no toast, no agent message. Returns
 * false when there is nothing in the foreground to pause. Callers compose the
 * messaging.
 */
export function pauseAllForeground(reg: BackgroundRegistry, ctx: UiContext): boolean {
    if (reg.foreground.size === 0) return false;
    for (const slot of reg.foreground.values()) {
        slot.requestPause("manual");
    }
    reg.foreground.clear();
    renderSidebar(reg, ctx);
    return true;
}

/** Move the current foreground command(s) to the background. The tool result
 *  already tells the model what happened (CC's exact `Command was manually
 *  backgrounded by user with ID: ...` string), so no synthetic agent message
 *  is sent — only the UI toast. */
export function backgroundActiveForeground(
    reg: BackgroundRegistry,
    ctx: UiContext
): boolean {
    if (!pauseAllForeground(reg, ctx)) return false;
    ctx.ui.notify("▶ Backgrounded — continuing.", "info");
    return true;
}

/** Outcome of a Ctrl+Shift+B / `/bg` control-handover. */
export type ControlOutcome = "backgrounded" | "queued" | "nothing";

/**
 * Claude Code's Ctrl+B, faithfully (on Ctrl+Shift+B here, since pi owns
 * Ctrl+B): background ALL running foreground commands (CC's `backgroundAll`).
 *
 * It deliberately does NOT call ctx.abort(): in pi, aborting restores any queued
 * message to the editor (unsent), renders a scary "Operation aborted", AND kills
 * the running process — exactly the data-loss we must avoid. Instead, like
 * Claude Code, backgrounding makes the bash tool return; the turn ends and any
 * queued message drains at the natural turn boundary.
 */
export function takeControl(
    reg: BackgroundRegistry,
    ctx: ControlContext
): ControlOutcome {
    if (pauseAllForeground(reg, ctx)) {
        ctx.ui.notify("▶ Backgrounded — continuing.", "info");
        return "backgrounded";
    }

    // Nothing in the foreground to background. If a message is queued behind the
    // current turn, set expectations rather than abort (abort would lose it).
    if (!ctx.isIdle() && ctx.hasPendingMessages()) {
        ctx.ui.notify("Message queued — it'll send when the current step finishes.", "info");
        return "queued";
    }

    ctx.ui.notify("No running process to background.", "warning");
    return "nothing";
}

// --- Helpers -------------------------------------------------------------

/** Verify the cwd actually exists. Throws a clear error if not. */
export function requireExistingCwd(cwd: string): void {
    try {
        fsStatSync(cwd);
    } catch {
        throw new Error(`Working directory does not exist: ${cwd}`);
    }
}

/** True for whitespace-only commands. bash silently passes empty commands, so reject them explicitly. */
export function isBlankCommand(command: string): boolean {
    return command.trim().length === 0;
}

/**
 * True when the command is eligible for auto-backgrounding. Rejects commands
 * like `sleep` where backgrounding is pointless.
 */
const DISALLOWED_AUTO_BACKGROUND = new Set(["sleep"]);
export function isAutoBackgroundAllowed(command: string): boolean {
    const base = command.trim().split(/\s+/)[0] ?? "";
    return !DISALLOWED_AUTO_BACKGROUND.has(base);
}

/**
 * Actionable guidance shown when a naive `sleep N` wait is blocked. A fixed
 * sleep both wastes time and leaves a lingering background job; every bullet
 * points at a tool that ends as soon as the real work does.
 */
export const SLEEP_WAIT_GUIDANCE =
    "A fixed `sleep N` to wait wastes time and leaves a job lingering for the " +
    "full duration. Instead:\n" +
    "• Waiting on a background job you started? Use jobs action='attach' — it " +
    "returns as soon as that job finishes.\n" +
    "• Waiting for a condition? Use the monitor tool, or a poll loop that EXITS " +
    "when ready (e.g. `until grep -q READY log; do sleep 0.5; done`).\n" +
    "• Just pacing/rate-limiting? Keep it under 2 seconds.";

/** A bare `sleep N[unit]` that counts as a wait (>= 2s). Float durations
 *  (`sleep 0.5`) and sub-2s integer sleeps are deliberate pacing — allowed. */
function detectSleepClause(segment: string): string | null {
    // Allow a trailing `&` — a backgrounded `sleep 600 &` is itself a lingering job.
    const m = /^sleep\s+(\d+)([smhd]?)\s*&?\s*$/.exec(segment);
    if (!m) return null;
    const unit = m[2] || "s";
    if (unit === "s" && parseInt(m[1], 10) < 2) return null;
    return `sleep ${m[1]}${m[2]}`;
}

/**
 * Detect a `sleep N` used as a naive wait — `sleep 600`, `cd x; sleep 600;
 * check`, `build && sleep 5 && test`, `sleep 5m`. Catches it as a top-level
 * step in a flat command sequence (split on top-level `;`, `&&`, `||`).
 *
 * Deliberately conservative around control flow: a `sleep` inside a while/until/
 * for loop is the *correct* polling pattern, and subshells / command
 * substitution make flat splitting unsafe — there we check only the leading
 * command, so a legitimate `until ready; do sleep 1; done` is never flagged.
 *
 * Returns the offending `sleep` clause, or null.
 */
export function detectBlockedSleep(command: string): string | null {
    const trimmed = command.trim();
    // Only an actual loop body can leave a bare `sleep N` segment after a flat
    // split (`do work; sleep 5; done`); an if/case block keeps its `then`/`)`
    // prefix on the sleep, so those don't need special handling. We detect the
    // structural loop pairing (not loose keywords, so `echo done` is fine) and
    // grouping/command-substitution, and fall back to the leading command there.
    const unsafeToSplit =
        /\b(while|until|for)\b[\s\S]*?\bdo\b/.test(trimmed) ||
        /\bdo\b[\s\S]*?\bdone\b/.test(trimmed) ||
        /[(){}`]|\$\(/.test(trimmed);
    // Newline is bash's primary command separator, alongside ; && || — split on
    // all of them so `start-server\nsleep 5\ncurl` is caught like `…; sleep 5; …`.
    const SEPARATORS = /&&|\|\||;|\n/;
    const segments = unsafeToSplit
        ? [trimmed.split(SEPARATORS)[0] ?? ""]
        : trimmed.split(SEPARATORS);
    for (const segment of segments) {
        const clause = detectSleepClause(segment.trim());
        if (clause) return clause;
    }
    return null;
}

// --- Non-interactive mode detection --------------------------------------

/** Detect whether pi is running non-interactively (print / non-TTY). */
export function detectNonInteractive(
    argv: readonly string[],
    stdinIsTTY: boolean
): boolean {
    if (!stdinIsTTY) return true;
    return argv.includes("-p") || argv.includes("--print");
}
