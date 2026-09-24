import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { BackgroundRegistry } from "../state.ts";
import { registerBashTool } from "../tools/bash.ts";
import { killProcessTree } from "../spawn.ts";
import { EVENT, type Job } from "../types.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ToolDef {
    execute: (
        toolCallId: string,
        params: unknown,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown
    ) => Promise<{ content: Array<{ type: "text"; text: string }> }>;
}

interface CapturedMessage {
    customType: string;
    content: string;
}

function harness() {
    let tool: ToolDef | undefined;
    const messages: CapturedMessage[] = [];
    const pi = {
        registerTool: (def: ToolDef) => { tool = def; },
        sendMessage: (m: CapturedMessage) => { messages.push(m); },
    };
    const reg = new BackgroundRegistry();
    registerBashTool(pi as never, reg, {} as never);
    const ctx = {
        cwd: process.cwd(),
        ui: {
            notify: () => {},
            setWidget: () => {},
            setStatus: () => {},
            theme: { fg: (_c: string, t: string) => t },
        },
    };
    return { tool: tool!, reg, ctx, messages };
}

function onlyJob(reg: BackgroundRegistry): Job {
    const jobs = [...reg.jobs.values()];
    assert.equal(jobs.length, 1);
    return jobs[0] as Job;
}

void describe("bash tool — Claude Code tool-result strings", () => {
    const spawnedPids: number[] = [];

    void it("run_in_background returns the generic CC string (no Name fragment)", async () => {
        const { tool, reg, ctx } = harness();
        const res = await tool.execute(
            "t1",
            { command: "tail -f /dev/null", run_in_background: true, description: "my job" },
            undefined,
            undefined,
            ctx
        );
        const job = onlyJob(reg);
        spawnedPids.push(job.pid);
        assert.equal(
            res.content[0].text,
            `Command running in background with ID: ${job.id}. Output is being written to: ${job.logPath}`
        );
    });

    void it("manual background (Ctrl+Shift+B) returns the manual CC string", async () => {
        const { tool, reg, ctx } = harness();
        const pending = tool.execute(
            "t2",
            { command: "tail -f /dev/null" },
            undefined,
            undefined,
            ctx
        );
        await sleep(400);
        reg.foreground.get("t2")?.requestPause("manual");
        const res = await pending;
        const job = onlyJob(reg);
        spawnedPids.push(job.pid);
        assert.equal(
            res.content[0].text,
            `Command was manually backgrounded by user with ID: ${job.id}. Output is being written to: ${job.logPath}`
        );
    });

    void it("timeout auto-background returns the same generic CC string", async () => {
        const { tool, reg, ctx } = harness();
        const res = await tool.execute(
            "t3",
            { command: "tail -f /dev/null", timeout: 1 },
            undefined,
            undefined,
            ctx
        );
        const job = onlyJob(reg);
        spawnedPids.push(job.pid);
        assert.equal(
            res.content[0].text,
            `Command running in background with ID: ${job.id}. Output is being written to: ${job.logPath}`
        );
    });

    void it("timeout kill (auto-background not allowed) appends 'Command timed out after Ns' to the log", async () => {
        const { tool, ctx } = harness();
        // `sleep` is excluded from auto-backgrounding, and a float duration
        // slips past the blocked-sleep guard — so this hits the kill path.
        const res = await tool.execute(
            "t4",
            { command: "sleep 1.5", timeout: 1 },
            undefined,
            undefined,
            ctx
        );
        assert.match(res.content[0].text, /Command timed out after 1s/);
    });

    void it("an external signal death is reported as killed ('was stopped'), never completed", async () => {
        const { tool, reg, ctx, messages } = harness();
        await tool.execute(
            "t5",
            { command: "tail -f /dev/null", run_in_background: true },
            undefined,
            undefined,
            ctx
        );
        const job = onlyJob(reg);
        // External kill — node reports code null + the signal; the job must
        // NOT be misreported as completed.
        killProcessTree(job.pid, "SIGKILL");
        await sleep(300);

        const terminals = messages.filter((m) => m.customType === EVENT.taskNotification);
        assert.equal(terminals.length, 1);
        assert.ok(terminals[0].content.includes("<status>killed</status>"));
        assert.ok(terminals[0].content.includes("was stopped"));
        assert.ok(!terminals[0].content.includes("completed"));
        assert.equal(job.status, "killed");
    });

    after(() => {
        for (const pid of spawnedPids) {
            try { killProcessTree(pid, "SIGKILL"); } catch { /* already gone */ }
        }
    });
});
