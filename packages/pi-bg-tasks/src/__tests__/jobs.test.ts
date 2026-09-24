/**
 * `jobs` tool actions — kill result strings (CC's TaskStopTool), unknown-id
 * errors, read-marks-notified (CC's TaskOutputTool), and the lazy eviction
 * sweep in `jobs list`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BackgroundRegistry } from "../state.ts";
import { registerJobsTool } from "../tools/jobs.ts";
import { add, createRunningJob } from "../registry.ts";
import { markNotified } from "../notify.ts";
import type { Job, UiContext } from "../types.ts";

const dir = join(tmpdir(), `pi-bg-jobs-${process.pid}`);
mkdirSync(dir, { recursive: true });

interface CapturedTool {
    execute: (
        toolCallId: string,
        params: unknown,
        signal: unknown,
        onUpdate: unknown,
        ctx: unknown
    ) => Promise<{ content: { type: "text"; text: string }[] }>;
}

function harness() {
    const messages: { customType: string }[] = [];
    let tool: CapturedTool | undefined;
    const pi = {
        registerTool(def: CapturedTool) {
            tool = def;
        },
        sendMessage(msg: { customType: string }) {
            messages.push(msg);
        },
    };
    const reg = new BackgroundRegistry();
    registerJobsTool(pi as never, reg);
    const ctx = {
        ui: {
            notify() {},
            setWidget() {},
            setStatus() {},
            theme: { fg: (_c: string, t: string) => t },
        },
    } as unknown as UiContext;
    return { tool: tool!, reg, ctx, messages };
}

function mkJob(reg: BackgroundRegistry, over: Partial<Job>): Job {
    const logPath = join(dir, `${over.id ?? "job"}.log`);
    writeFileSync(logPath, "some output\n");
    const job = createRunningJob({
        id: over.id ?? `job-${process.pid}-1`,
        command: over.command ?? "npm test",
        pid: 0,
        logPath,
        toolCallId: "tc-1",
        name: over.name,
    });
    Object.assign(job, over, { logPath });
    add(reg, job);
    return job;
}

void describe("jobs kill — CC's TaskStopTool", () => {
    void it("returns the exact CC success string and suppresses the notification", async () => {
        const { tool, reg, ctx, messages } = harness();
        const job = mkJob(reg, { id: `job-${process.pid}-k1`, command: "npm run\nbuild" });
        const res = await tool.execute(
            "t1",
            { action: "kill", jobId: job.id },
            undefined,
            undefined,
            ctx
        );
        assert.equal(
            res.content[0].text,
            `Successfully stopped task: ${job.id} (npm run build)`
        );
        assert.equal(job.status, "killed");
        assert.equal(job.notified, true, "latched so the exit path skips notifying");
        assert.equal(messages.length, 0, "no <task-notification> for a deliberate kill");
    });

    void it("unknown id errors with CC's exact string", async () => {
        const { tool, ctx } = harness();
        await assert.rejects(
            () => tool.execute("t2", { action: "kill", jobId: "nope" }, undefined, undefined, ctx),
            /^Error: No task found with ID: nope$/
        );
    });
});

void describe("jobs output — read-marks-notified", () => {
    void it("marks a terminal job notified on read", async () => {
        const { tool, reg, ctx } = harness();
        const job = mkJob(reg, { id: `job-${process.pid}-o1` });
        job.status = "completed";
        job.exitCode = 0;
        await tool.execute("t3", { action: "output", jobId: job.id }, undefined, undefined, ctx);
        assert.equal(job.notified, true);
    });

    void it("does NOT mark a still-running job (peek)", async () => {
        const { tool, reg, ctx } = harness();
        const job = mkJob(reg, { id: `job-${process.pid}-o2` });
        await tool.execute("t4", { action: "output", jobId: job.id }, undefined, undefined, ctx);
        assert.equal(job.notified, undefined, "completion must still notify later");
    });

    void it("unknown id errors with CC's exact string", async () => {
        const { tool, ctx } = harness();
        await assert.rejects(
            () => tool.execute("t5", { action: "output", jobId: "ghost" }, undefined, undefined, ctx),
            /No task found with ID: ghost/
        );
    });
});

void describe("jobs list — lazy sweep", () => {
    void it("sweeps terminal+notified jobs into the recent-terminal ring", async () => {
        const { tool, reg, ctx } = harness();
        const running = mkJob(reg, { id: `job-${process.pid}-l1`, command: "run-me" });
        const swept = mkJob(reg, { id: `job-${process.pid}-l3`, command: "done-read" });
        swept.status = "completed";
        swept.exitCode = 0;
        markNotified(swept);

        const res = await tool.execute("t6", { action: "list" }, undefined, undefined, ctx);
        const text = res.content[0].text;

        assert.equal(reg.jobs.has(swept.id), false, "terminal+notified evicted by the sweep");
        assert.ok(text.includes("run-me"), "running job listed");
        assert.match(text, /done-read - ✓ completed\n?$/, "swept job shows as a recent terminal");
        assert.ok(running.status === "running");
    });
});

process.on("exit", () => {
    try {
        rmSync(dir, { recursive: true, force: true });
    } catch {
        /* best-effort */
    }
});
