/**
 * `jobs` tool — manage background jobs.
 *
 * Actions:
 *   - list: show all jobs (running + recently terminal)
 *   - output: read a job's log tail (non-blocking peek)
 *   - kill: terminate a job
 *   - attach: follow a job's live output and wait for it to finish
 *   - search: regex-search all job output
 *   - cleanup: purge terminal jobs
 *   - stats: aggregate metrics
 */

import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { BackgroundRegistry } from "../state.ts";
import {
    isTerminalStatus,
    OUTPUT_PREVIEW_CHARS,
    PREVIEW_CHARS,
    type UiContext,
} from "../types.ts";
import { processExists } from "../spawn.ts";
import {
    cleanupTerminal,
    findJob,
    forget,
    getStats,
    readLogTail,
    renderSidebar,
} from "../registry.ts";
import { formatDuration, formatJobLine, jobLabel, oneLine, textBlock } from "../format.ts";
import { streamLog } from "../output.ts";
import { searchLogs } from "../log-search.ts";
import { markNotified } from "../notify.ts";
import {
    ensureCompletionPromise,
    markTerminal,
    terminateJobSilently,
} from "../lifecycle.ts";

/** Register the `jobs` tool. */
export function registerJobsTool(
    pi: ExtensionAPI,
    reg: BackgroundRegistry
): void {
    pi.registerTool({
        name: "jobs",
        label: "Background Jobs",
        description:
            "Manage background jobs: list, output, kill, attach, search, cleanup, and stats.",
        promptSnippet: "Inspect and manage background jobs",
        promptGuidelines: [
            "list: show all jobs",
            "output: show the log tail for one job",
            "kill: terminate a job",
            "attach: follow a job's live output and wait for it to finish (use output for a non-blocking peek)",
            "search: regex-search all job output",
            "cleanup: purge terminal jobs",
            "stats: show aggregate metrics",
            "Completion notices are informational — call 'output' on a FAILED job, or on any job whose output is the deliverable (e.g. a test/build you must report). Don't call it just to acknowledge a completed job.",
        ],
        parameters: Type.Object({
            action: StringEnum(
                [
                    "list",
                    "output",
                    "kill",
                    "attach",
                    "search",
                    "cleanup",
                    "stats",
                ] as const,
                { description: "Action to perform" }
            ),
            jobId: Type.Optional(Type.String({ description: "Job ID" })),
            pattern: Type.Optional(
                Type.String({ description: "Regex pattern for search" })
            ),
            wait: Type.Optional(
                Type.Boolean({
                    description: "Whether attach should wait for completion (default: true)",
                })
            ),
        }),

        async execute(_toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<undefined>> {
            const p = params as {
                action: "list" | "output" | "kill" | "attach" | "search" | "cleanup" | "stats";
                jobId?: string;
                pattern?: string;
                wait?: boolean;
            };
            switch (p.action) {
                case "list":
                    return listAction(reg);
                case "output":
                    return await outputAction(reg, p.jobId!);
                case "kill":
                    return await killAction(reg, p.jobId!, ctx);
                case "attach":
                    return await attachAction(reg, p.jobId!, p.wait ?? true, signal, onUpdate, ctx);
                case "search":
                    return await searchAction(reg, p.pattern ?? "");
                case "cleanup":
                    return cleanupAction(reg, ctx);
                case "stats":
                    return statsAction(reg);
            }
        },
    });
}

// ─── list: show all jobs ─────────────────────────────────────────────────

function listAction(reg: BackgroundRegistry): AgentToolResult<undefined> {
    // Lazy eviction sweep: terminal jobs whose outcome was already surfaced
    // (notified — via the <task-notification>, a kill, or a read) leave the
    // live registry here. Their output logs stay on disk.
    for (const job of Array.from(reg.jobs.values())) {
        if (isTerminalStatus(job.status) && job.notified) forget(reg, job);
    }
    const running = Array.from(reg.jobs.values()).filter(
        (j) => j.status === "running"
    );
    const recent = reg.recentTerminal.slice(-5).reverse();
    const lines = [
        ...running.map((j) => formatJobLine(j)),
        ...recent.map((j) => formatJobLine(j)),
    ];
    return {
        content: [
            textBlock(
                lines.length > 0
                    ? `Background Jobs:\n${lines.join("\n")}`
                    : "No background jobs"
            ),
        ],
        details: undefined,
    };
}

// ─── output: read a job's log tail ───────────────────────────────────────

async function outputAction(
    reg: BackgroundRegistry,
    jobId: string
): Promise<AgentToolResult<undefined>> {
    const job = findJob(reg, jobId);
    if (!job) throw new Error(`No task found with ID: ${jobId}`);
    // CC's TaskOutputTool: a successful read of a TERMINAL job's output marks
    // it notified, suppressing the separate <task-notification>. Peeking at a
    // still-running job does NOT mark — its completion must still notify.
    if (isTerminalStatus(job.status)) markNotified(job);
    const out = readLogTail(job, OUTPUT_PREVIEW_CHARS).trimEnd();
    const label = jobLabel(job);
    return {
        content: [
            textBlock(
                out
                    ? `Output for ${label} (${job.status})\n${out}`
                    : `No output yet for ${label} (${job.status}). Log: ${job.logPath}`
            ),
        ],
        details: undefined,
    };
}

// ─── kill: terminate a job ───────────────────────────────────────────────

async function killAction(
    reg: BackgroundRegistry,
    jobId: string,
    ctx: UiContext
): Promise<AgentToolResult<undefined>> {
    const job = findJob(reg, jobId);
    if (!job) throw new Error(`No task found with ID: ${jobId}`);
    if (isTerminalStatus(job.status)) {
        throw new Error(`Job is not running: ${job.id}`);
    }
    // terminateJobSilently latches `notified` BEFORE the kill, so the exit
    // handler skips the <task-notification> — this result IS the outcome.
    terminateJobSilently(reg, job);
    renderSidebar(reg, ctx);
    // Claude Code's TaskStopTool result string (command collapsed to one line).
    return {
        content: [
            textBlock(`Successfully stopped task: ${job.id} (${oneLine(job.command)})`),
        ],
        details: undefined,
    };
}

// ─── attach: follow live output until completion ─────────────────────────

async function attachAction(
    reg: BackgroundRegistry,
    jobId: string,
    waitForCompletion: boolean,
    signal: AbortSignal | undefined,
    onUpdate: ((u: { content: Array<{ type: "text"; text: string }>; details: undefined }) => void) | undefined,
    ctx: UiContext
): Promise<AgentToolResult<undefined>> {
    const job = findJob(reg, jobId);
    if (!job) throw new Error(`No task found with ID: ${jobId}`);
    const label = jobLabel(job);

    if (job.status === "running" && waitForCompletion) {
        ensureCompletionPromise(job);
        // We're actively following this job — suppress its separate completion
        // notification so the attach result is the single notification. Undone
        // on the abort path below, so a job we detach from still reports when
        // it ends.
        job.notified = true;

        // Bail early if the OS process already died.
        if (job.pid > 0 && !processExists(job.pid)) {
            markTerminal(job, "failed");
        }

        onUpdate?.({
            content: [
                textBlock(`Following ${label} live output — waiting for it to finish…`),
            ],
            details: undefined,
        });

        // Stream the live log tail while we wait, so "attach" shows progress
        // instead of sitting silent.
        const poller = streamLog(job.logPath, onUpdate);
        let onAbort: (() => void) | undefined;
        try {
            if (signal && !signal.aborted) {
                const abortPromise = new Promise<void>((resolve) => {
                    onAbort = resolve;
                    signal.addEventListener("abort", onAbort, { once: true });
                });
                await Promise.race([job.donePromise, abortPromise]);
            } else {
                await job.donePromise;
            }
        } finally {
            poller.stop();
            if (signal && onAbort) signal.removeEventListener("abort", onAbort);
        }

        if (job.status === "running") {
            // Aborted before completion — we never reported the finish, so let
            // the job's own completion notification fire later.
            job.notified = false;
            return {
                content: [
                    textBlock(
                        `Stopped following ${label} — it's still running in the background. Use jobs output to check on it.`
                    ),
                ],
                details: undefined,
            };
        }
    }

    const message = `${label} finished. Status: ${job.status}`;
    ctx.ui.notify(message, job.status === "failed" ? "error" : "info");
    // The attach result IS the outcome notification — mark it notified so the
    // <task-notification> is suppressed (CC parity). Covers both the "attached
    // to an already-terminal job" and "waited then finished" cases; idempotent
    // with the running-branch set above.
    markNotified(job);
    return {
        content: [textBlock(`${message}. Use jobs output for the full log.`)],
        details: undefined,
    };
}

// ─── search ──────────────────────────────────────────────────────────────

const SEARCH_DISPLAY_LIMIT_PER_JOB = 20;

async function searchAction(
    reg: BackgroundRegistry,
    pattern: string
): Promise<AgentToolResult<undefined>> {
    if (!pattern) throw new Error("search action requires a pattern");

    let re: RegExp;
    try {
        re = new RegExp(pattern);
    } catch (err) {
        throw new Error(`Invalid regex: ${(err as Error).message}`);
    }

    const result = await searchLogs({
        jobs: [...Array.from(reg.jobs.values()), ...reg.recentTerminal],
        pattern: re,
        maxHitsPerJob: SEARCH_DISPLAY_LIMIT_PER_JOB,
        maxLineChars: PREVIEW_CHARS.line,
    });

    if (result.totalHits === 0) {
        return {
            content: [textBlock(`No matches for /${pattern}/ in any job log.`)],
            details: undefined,
        };
    }

    const blocks = result.groups.map((group) => {
        const headLabel = group.name ? `${group.name} (${group.jobId})` : group.jobId;
        const body = group.hits
            .map((h) => `  ${h.path}:${h.line}: ${h.text}`)
            .join("\n");
        const more = group.count > group.hits.length
            ? `\n  ... and ${group.count - group.hits.length} more`
            : "";
        return `${headLabel} (${group.count} matches)\n${body}${more}`;
    });

    return {
        content: [
            textBlock(
                `Found ${result.totalHits} matches for /${pattern}/ across ${result.groups.length} job(s):\n\n${blocks.join("\n\n")}`
            ),
        ],
        details: undefined,
    };
}

// ─── cleanup ─────────────────────────────────────────────────────────────

function cleanupAction(
    reg: BackgroundRegistry,
    ctx: UiContext
): AgentToolResult<undefined> {
    const { purged, bytesReclaimed } = cleanupTerminal(reg);
    renderSidebar(reg, ctx);
    const kb = Math.round(bytesReclaimed / 1024);
    return {
        content: [
            textBlock(
                `Cleaned up ${purged} terminal job(s). Reclaimed ${kb} KiB of disk.`
            ),
        ],
        details: undefined,
    };
}

// ─── stats ───────────────────────────────────────────────────────────────

function statsAction(reg: BackgroundRegistry): AgentToolResult<undefined> {
    const s = getStats(reg);
    const lines = [
        `Total started:   ${s.totalStarted}`,
        `Currently running: ${s.running}`,
        `Completed:        ${s.completed}`,
        `Failed:           ${s.failed}`,
        `Killed:           ${s.killed}`,
        `Recent terminal:  ${s.recentTerminal}`,
        `Average duration: ${formatDuration(s.averageDurationMs)}`,
        `Total CPU time:   ${formatDuration(s.totalDurationMs)}`,
    ];
    return {
        content: [textBlock("Background Jobs Stats:\n" + lines.join("\n"))],
        details: undefined,
    };
}
