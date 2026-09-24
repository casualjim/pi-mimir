/**
 * Stall detection for background jobs.
 *
 * Watches a job's log file and warns the agent when output stops growing while
 * the tail looks like an interactive prompt, or kills the job when output
 * exceeds the size cap. Progress streaming lives in output.ts (pollFileTail).
 */

import { openSync, readSync, closeSync, statSync as fsStatSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
    DELIVER_FOLLOWUP,
    DELIVER_STEER,
    EVENT,
    MAX_LOG_BYTES,
    STALL_CHECK_INTERVAL_MS,
    STALL_TAIL_BYTES,
    STALL_THRESHOLD_MS,
} from "./types.ts";
import { buildTaskNotification } from "./notify.ts";
import { describeJob } from "./format.ts";

// --- Stall watcher -------------------------------------------------------

/**
 * Detect a stalled job. When the output file:
 *   1. exceeds MAX_LOG_BYTES, call onOversize and report the job terminated;
 *   2. has not grown for STALL_THRESHOLD_MS and its tail matches an interactive
 *      prompt pattern, send a bg-stall warning.
 *
 * Callers MUST invoke the returned cancel on completion to clear the interval.
 */
export function watchStalls(args: {
    jobId: string;
    command: string;
    /** Job name (bash/bash_bg `description`); falls back to the command. */
    name?: string;
    logPath: string;
    pi: ExtensionAPI;
    onOversize?: () => void;
    /** Skip the interactive-prompt stall heuristic (used for monitors). */
    disablePromptStall?: boolean;
    /** Skip the oversize auto-kill (used for persistent monitors). */
    disableOversizeKill?: boolean;
}): () => void {
    let lastSize = 0;
    let lastGrowth = Date.now();
    let lastPromptCheckSize = -1;
    let cancelled = false;

    const tick = () => {
        if (cancelled) return;
        try {
            const { size } = fsStatSync(args.logPath);

            if (size > MAX_LOG_BYTES && !args.disableOversizeKill) {
                cancelled = true;
                if (args.onOversize) args.onOversize();
                args.pi.sendMessage(
                    {
                        customType: EVENT.stall,
                        content: `⚠️ Background job ${args.jobId} exceeded ${MAX_LOG_BYTES / (1024 * 1024)} MiB output. Terminated.`,
                        display: true,
                        details: { jobId: args.jobId, logPath: args.logPath, command: args.command },
                    },
                    DELIVER_FOLLOWUP
                );
                return;
            }

            if (size > lastSize) {
                lastSize = size;
                lastGrowth = Date.now();
            } else if (
                !args.disablePromptStall &&
                Date.now() - lastGrowth >= STALL_THRESHOLD_MS &&
                size !== lastPromptCheckSize
            ) {
                // Output is static and past the stall threshold. Read the tail
                // once per size — re-reading identical bytes every tick is pure
                // waste, since the prompt verdict cannot change until it grows.
                lastPromptCheckSize = size;
                const fd = openSync(args.logPath, "r");
                try {
                    const readStart = Math.max(0, size - STALL_TAIL_BYTES);
                    const toRead = Math.min(size, STALL_TAIL_BYTES);
                    const buf = Buffer.alloc(toRead);
                    readSync(fd, buf, 0, toRead, readStart);
                    const tail = buf.toString("utf-8", 0, toRead);
                    if (looksLikePrompt(tail)) {
                        cancelled = true;
                        sendStallPrompt(args.pi, args.jobId, describeJob(args.name, args.command), args.logPath, tail);
                        return;
                    }
                } finally {
                    closeSync(fd);
                }
            }
        } catch {
            /* File may not exist yet — retry next tick. */
        }
        schedule();
    };
    // Re-arm with a fresh timer each tick (rather than refresh()) so the
    // watcher also works under node:test mock timers. Global setTimeout —
    // a node:timers named import is snapshotted before mock.timers.enable.
    let timer: NodeJS.Timeout;
    const schedule = () => {
        timer = setTimeout(tick, STALL_CHECK_INTERVAL_MS);
        timer.unref();
    };
    schedule();

    return () => {
        cancelled = true;
        clearTimeout(timer);
    };
}

// --- Prompt pattern matching ---------------------------------------------

/** Patterns that identify an interactive prompt. */
export const PROMPT_PATTERNS = [
    /\(y\/n\)/i,
    /\[y\/n\]/i,
    /\(yes\/no\)/i,
    /\b(?:Do you|Would you|Shall I|Are you sure|Ready to)\b.*\? *$/i,
    /Press (any key|Enter)/i,
    /Continue\?/i,
    /Overwrite\?/i,
];

/** True when the last line of the tail matches a prompt pattern. */
export function looksLikePrompt(tail: string): boolean {
    const lastLine = tail.trimEnd().split("\n").pop() ?? "";
    return PROMPT_PATTERNS.some((p) => p.test(lastLine));
}

/**
 * Send the interactive-prompt stall warning: Claude Code's <task-notification>
 * shape WITHOUT a <status> tag (CC omits it deliberately — the job is still
 * running), followed by the output tail and remediation guidance as plain
 * text, all as ONE message content. Delivered like a completion (steer +
 * triggerTurn). Does NOT touch the job's `notified` latch — a later real
 * completion must still notify.
 */
function sendStallPrompt(
    pi: ExtensionAPI,
    jobId: string,
    description: string,
    logPath: string,
    tail: string
): void {
    const summary = `Background command "${description}" appears to be waiting for interactive input`;
    const content =
        buildTaskNotification({ taskId: jobId, outputFile: logPath, summary }) +
        `\nLast output:\n${tail.trimEnd()}\n\n` +
        `The command is likely blocked on an interactive prompt. Kill this task and re-run ` +
        `with piped input (e.g., \`echo y | command\`) or a non-interactive flag if one exists.`;

    pi.sendMessage(
        {
            customType: EVENT.taskNotification,
            content,
            display: true,
            details: { jobId, logPath, summary },
        },
        DELIVER_STEER
    );
}
