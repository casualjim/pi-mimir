/**
 * Background tasks TUI panel — the /bg-list interactive manager.
 *
 * Uses Pi's ctx.ui.select()/ctx.ui.editor() primitives (available in both
 * command and shortcut contexts) to provide Claude Code-style job management:
 * - pick a job from the list
 * - show output / kill / remove actions
 */

import type { Job, UiContext } from "./types.ts";
import { OUTPUT_PREVIEW_CHARS, PREVIEW_CHARS } from "./types.ts";
import type { BackgroundRegistry } from "./state.ts";
import { formatDuration, jobLabel } from "./format.ts";
import { terminateJobSilently } from "./lifecycle.ts";
import { forget, readLogTail, renderSidebar } from "./registry.ts";

export async function openBgListPanel(
    reg: BackgroundRegistry,
    ctx: UiContext
): Promise<void> {
    // Use select()-based panel (works in both command and shortcut contexts).
    while (true) {
        const jobs = getJobList(reg);
        if (jobs.length === 0) {
            ctx.ui.notify("No background tasks", "info");
            return;
        }

        const items = jobs.map((job) => {
            const icon = statusIcon(job);
            const dur = formatDuration(Date.now() - job.startTime);
            const label = job.name ? `${job.name} (${job.id})` : job.id;
            const statusStr = job.status === "running" ? `running (${dur})` : job.status;
            const cmd = job.command.slice(0, PREVIEW_CHARS.taskList);
            return `${icon} ${label}: ${cmd} · ${statusStr}`;
        });

        const choice = await ctx.ui.select("Background Tasks", items);
        if (choice === undefined) return;

        const idx = items.indexOf(choice);
        const job = jobs[idx];
        if (!job) return;

        const continued = await showJobActions(job, reg, ctx);
        if (!continued) return;
    }
}

async function showJobActions(
    job: Job,
    reg: BackgroundRegistry,
    ctx: UiContext
): Promise<boolean> {
    const name = jobLabel(job);

    if (job.status === "running") {
        const options = ["Show Output", "Kill", "← Back"];
        const action = await ctx.ui.select(
            `▶ ${name} · ${job.command.slice(0, PREVIEW_CHARS.detail)}`,
            options
        );
        if (action === undefined) return false;
        if (action === "Show Output") { await showOutput(job, ctx); return true; }
        if (action === "Kill") {
            terminateJobSilently(reg, job);
            renderSidebar(reg, ctx);
            ctx.ui.notify(`Killed ${name}`, "info");
            return true;
        }
        return true;
    }

    const options = ["Show Output", "Remove", "← Back"];
    const action = await ctx.ui.select(`${statusIcon(job)} ${name} · ${job.status}`, options);
    if (action === undefined) return false;
    if (action === "Show Output") { await showOutput(job, ctx); return true; }
    if (action === "Remove") {
        forget(reg, job);
        renderSidebar(reg, ctx);
        ctx.ui.notify(`Removed ${name}`, "info");
        return true;
    }
    return true;
}

async function showOutput(job: Job, ctx: UiContext): Promise<void> {
    const out = readLogTail(job, OUTPUT_PREVIEW_CHARS);
    const dur = formatDuration(Date.now() - job.startTime);
    const exitLine = job.exitCode !== undefined ? `\nExit code: ${job.exitCode}` : "";
    await ctx.ui.editor(
        `${statusIcon(job)} ${jobLabel(job)}`,
        `Command: ${job.command}\n` +
        `PID: ${job.pid} · Started: ${new Date(job.startTime).toLocaleString()}\n` +
        `Duration: ${dur} · Status: ${job.status}${exitLine}\n` +
        `Log: ${job.logPath}\n\n--- OUTPUT ---\n${out}`
    );
}

function getJobList(reg: BackgroundRegistry): Job[] {
    const all = Array.from(reg.jobs.values());
    const running = all.filter((j) => j.status === "running").sort((a, b) => b.startTime - a.startTime);
    const terminal = all.filter((j) => j.status !== "running").sort((a, b) => b.startTime - a.startTime);
    return [...running, ...terminal];
}

function statusIcon(job: Job): string {
    switch (job.status) {
        case "pending": return "◌";
        case "running": return "▶";
        case "completed": return "✓";
        case "failed": return "✗";
        case "killed": return "✗";
    }
}
