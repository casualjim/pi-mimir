/**
 * Formatting helpers — duration strings, status pills, output tails.
 * The <task-notification> builder lives in src/notify.ts; this module is
 * the primitives layer that the rest of the codebase shares.
 */
import type { Job } from "./types.ts";
import { PREVIEW_CHARS } from "./types.ts";

/** The standard short label for a job: its name, or its id when unnamed. */
export function jobLabel(job: Job): string {
    return job.name ?? job.id;
}

/** Collapse all whitespace runs to single spaces — one-line rendering. */
export function oneLine(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

/** Human/agent prose label: the name when set, else the command collapsed to
 *  one line and truncated. (jobLabel = name ?? id for registry lookups;
 *  describeJob = name ?? one-line command for prose.) */
export function describeJob(name: string | undefined, command: string): string {
    if (name) return name;
    const line = oneLine(command);
    return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

/** "1m23s" / "45s" / "0s" — short human-readable duration. */
export function formatDuration(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return mins > 0 ? `${mins}m${secs}s` : `${secs}s`;
}

/** Human-readable status pill, including duration for running jobs. */
export function statusLabel(job: Job, duration?: string): string {
    const dur = duration ?? formatDuration(Date.now() - job.startTime);
    switch (job.status) {
        case "pending":
            return "◌ pending";
        case "running":
            if (job.kind === "monitor") return `◉ monitor (${dur})`;
            return job.isBackgrounded ? `▶ bg (${dur})` : `▶ fg (${dur})`;
        case "completed":
            return "✓ completed";
        case "failed":
            return "✗ failed";
        case "killed":
            return "✗ killed";
    }
}

/** "b7f3k9a2x1 [shell]: ls -la (last 80 chars)" — single line for `jobs list`.
 *  Every line carries the kind tag (shell/agent/monitor) so the unified list
 *  shows what each task is. */
export function formatJobLine(job: Job): string {
    const head = job.name ? `${job.name} (${job.id})` : job.id;
    const kind = job.kind ?? "shell";
    const duration =
        job.status === "running"
            ? ` (${formatDuration(Date.now() - job.startTime)})`
            : "";
    return `${head} [${kind}]: ${job.command.slice(0, PREVIEW_CHARS.line)} - ${statusLabel(job)}${duration}`;
}

/** Truncate a tail with a consistent "showing last N chars" marker. */
export function truncateTail(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;
    return `...[truncated, showing last ${maxChars} chars]\n${content.slice(-maxChars)}`;
}

/** Text content block builder — shared across all tools. The explicit return
 *  type documents the shared contract for the five tool call sites that
 *  import this — they rely on the literal shape, not inference. */
export function textBlock(s: string): { type: "text"; text: string } {
    return { type: "text" as const, text: s };
}
