/**
 * Task-completion notifications — Claude Code's <task-notification> engine.
 *
 * Every backgrounded job that reaches a terminal state enqueues its OWN
 * <task-notification> XML message, exactly once, the moment it exits. There
 * is no hold-and-flush and no coalescing window: pi's steer delivery queues
 * the message while the agent is streaming and delivers it at the next
 * tool-call boundary (CC's 'next' priority), or starts a turn when the agent
 * is idle (triggerTurn: true).
 *
 * Exactly-once is enforced by the job's `notified` latch — a check-and-set
 * done BEFORE the send, so any path that already surfaced the outcome (a
 * jobs output/attach read, a deliberate kill) suppresses the notification.
 * A terminal job that has been notified is evicted from the live registry;
 * its output log stays on disk and the notification carries the path.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DELIVER_STEER, EVENT, type Job } from "./types.ts";
import type { BackgroundRegistry } from "./state.ts";
import { forget } from "./registry.ts";
import { describeJob } from "./format.ts";

/** Terminal statuses a <task-notification> can carry. */
export type TerminalStatus = "completed" | "failed" | "killed";

/** Escape the XML special characters CC escapes inside element text. */
export function escapeXml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build Claude Code's exact <task-notification> XML block. The <tool_use_id>
 * line is included only when a toolUseId is present; the <status> line is
 * omitted deliberately for stall warnings (CC parity).
 */
export function buildTaskNotification(args: {
    taskId: string;
    toolUseId?: string;
    outputFile: string;
    status?: TerminalStatus;
    summary: string;
}): string {
    const lines = [
        "<task-notification>",
        `<task_id>${escapeXml(args.taskId)}</task_id>`,
        ...(args.toolUseId ? [`<tool_use_id>${escapeXml(args.toolUseId)}</tool_use_id>`] : []),
        `<output_file>${escapeXml(args.outputFile)}</output_file>`,
        ...(args.status ? [`<status>${args.status}</status>`] : []),
        `<summary>${escapeXml(args.summary)}</summary>`,
        "</task-notification>",
    ];
    return lines.join("\n");
}

/**
 * Claude Code's exact completion summary for a terminal job. `status`
 * overrides job.status for callers that notify before the job is marked
 * terminal (the monitor exit path).
 */
export function completionSummary(job: Job, status?: TerminalStatus): string {
    const s = status ?? (job.status as TerminalStatus);
    const desc = describeJob(job.name, job.command);
    if (job.kind === "monitor") {
        if (s === "killed") return `Monitor "${desc}" stopped`;
        if (s === "failed") return `Monitor "${desc}" script failed (exit ${job.exitCode ?? "unknown"})`;
        return `Monitor "${desc}" stream ended`;
    }
    if (job.kind === "agent") {
        if (s === "killed") return `Agent "${desc}" was stopped`;
        if (s === "failed") {
            return `Agent "${desc}" failed: ${job.exitCode !== undefined ? `exit code ${job.exitCode}` : "unknown error"}`;
        }
        return `Agent "${desc}" completed`;
    }
    if (s === "killed") return `Background command "${desc}" was stopped`;
    if (s === "failed") return `Background command "${desc}" failed with exit code ${job.exitCode ?? "unknown"}`;
    return `Background command "${desc}" completed${job.exitCode != null ? ` (exit code ${job.exitCode})` : ""}`;
}

/**
 * Set the notified latch (Claude Code's markTaskNotified). Idempotent. Called
 * by every path that surfaces a job's outcome WITHOUT the notification: kill
 * paths (before the kill, so the exit handler skips notifying) and terminal
 * reads (jobs output / attach).
 */
export function markNotified(job: Job): void {
    job.notified = true;
}

/**
 * Send a terminal job's <task-notification>, exactly once. The latch is set
 * BEFORE the send, so a concurrent consumer can never produce a duplicate;
 * if the send itself throws, the notification is lost rather than retried
 * (exactly-once), and the terminal+notified job lingers until the lazy sweep
 * in `jobs list`.
 *
 * On success the job is evicted from the live registry (terminal + notified)
 * unless `evict: false` — the monitor path sends before the job is marked
 * terminal and lets completeJob evict instead.
 *
 * Returns true when the notification was sent.
 */
export function sendTaskNotification(args: {
    reg: BackgroundRegistry;
    pi: ExtensionAPI;
    job: Job;
    /** Explicit terminal status when the job isn't marked terminal yet. */
    status?: TerminalStatus;
    /** Explicit summary (monitors compose their own). */
    summary?: string;
    evict?: boolean;
}): boolean {
    const { reg, pi, job } = args;
    if (job.notified) return false;
    job.notified = true;
    const status = args.status ?? (job.status as TerminalStatus);
    const summary = args.summary ?? completionSummary(job, status);

    try {
        pi.sendMessage(
            {
                customType: EVENT.taskNotification,
                content: buildTaskNotification({
                    taskId: job.id,
                    toolUseId: job.toolCallId || undefined,
                    outputFile: job.logPath,
                    status,
                    summary,
                }),
                display: true,
                details: {
                    jobId: job.id,
                    status,
                    summary,
                    outputFile: job.logPath,
                },
            },
            DELIVER_STEER
        );
    } catch (err) {
        console.error("[bg-tasks] task notification failed:", err);
        return false;
    }
    if (args.evict !== false) forget(reg, job);
    return true;
}
