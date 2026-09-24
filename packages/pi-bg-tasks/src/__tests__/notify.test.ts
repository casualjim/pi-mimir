import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BackgroundRegistry } from "../state.ts";
import {
    buildTaskNotification,
    completionSummary,
    escapeXml,
    markNotified,
    sendTaskNotification,
} from "../notify.ts";
import { completeJob } from "../lifecycle.ts";
import { add } from "../registry.ts";
import { EVENT, type Job, type UiContext } from "../types.ts";

interface Captured {
    customType: string;
    content: string;
    display?: boolean;
    details?: { jobId?: string; status?: string; summary?: string; outputFile?: string };
}

interface DeliverOpts {
    deliverAs: "steer" | "followUp";
    triggerTurn: boolean;
}

function harness(opts?: { deliverThrows?: boolean }) {
    const messages: Captured[] = [];
    const deliverOptions: DeliverOpts[] = [];
    const pi = {
        sendMessage: (m: Captured, o?: DeliverOpts) => {
            if (opts?.deliverThrows) throw new Error("sendMessage failed");
            messages.push(m);
            if (o) deliverOptions.push(o);
        },
    };
    const ctx = {
        ui: {
            notify() {},
            setWidget() {},
            setStatus() {},
            theme: { fg: (_c: string, t: string) => t },
        },
    } as unknown as UiContext;
    return { reg: new BackgroundRegistry(), pi, ctx, messages, deliverOptions };
}

function mkJob(over: Partial<Job>): Job {
    return {
        id: "job-1-1",
        command: "npm test",
        pid: 100,
        startTime: Date.now(),
        status: "completed",
        exitCode: 0,
        logPath: "/tmp/pi-bg/job-1-1.log",
        toolCallId: "tc-42",
        isBackgrounded: true,
        ...over,
    } as Job;
}

void describe("escapeXml", () => {
    void it("escapes &, < and > only", () => {
        assert.equal(escapeXml(`a & b <c> "q" 'apost'`), `a &amp; b &lt;c&gt; "q" 'apost'`);
    });
});

void describe("buildTaskNotification — CC's exact XML", () => {
    void it("includes tool_use_id and status when present", () => {
        const xml = buildTaskNotification({
            taskId: "job-1-1",
            toolUseId: "tc-42",
            outputFile: "/tmp/pi-bg/job-1-1.log",
            status: "completed",
            summary: `Background command "npm test" completed (exit code 0)`,
        });
        assert.equal(
            xml,
            [
                "<task-notification>",
                "<task_id>job-1-1</task_id>",
                "<tool_use_id>tc-42</tool_use_id>",
                "<output_file>/tmp/pi-bg/job-1-1.log</output_file>",
                "<status>completed</status>",
                `<summary>Background command "npm test" completed (exit code 0)</summary>`,
                "</task-notification>",
            ].join("\n")
        );
    });

    void it("omits the tool_use_id line when there is none", () => {
        const xml = buildTaskNotification({
            taskId: "job-1-1",
            outputFile: "/tmp/x.log",
            status: "failed",
            summary: "x",
        });
        assert.ok(!xml.includes("tool_use_id"));
    });

    void it("omits the status line when there is none (stall warning)", () => {
        const xml = buildTaskNotification({
            taskId: "job-1-1",
            outputFile: "/tmp/x.log",
            summary: "waiting",
        });
        assert.ok(!xml.includes("<status>"));
    });

    void it("escapes the summary", () => {
        const xml = buildTaskNotification({
            taskId: "t",
            outputFile: "f",
            summary: `a & <b>`,
        });
        assert.ok(xml.includes("<summary>a &amp; &lt;b&gt;</summary>"));
    });
});

void describe("completionSummary — CC's exact strings", () => {
    void it("bash completed with an exit code", () => {
        assert.equal(
            completionSummary(mkJob({ status: "completed", exitCode: 0 })),
            `Background command "npm test" completed (exit code 0)`
        );
    });
    void it("bash completed without an exit code omits the suffix", () => {
        assert.equal(
            completionSummary(mkJob({ status: "completed", exitCode: undefined })),
            `Background command "npm test" completed`
        );
    });
    void it("bash failed", () => {
        assert.equal(
            completionSummary(mkJob({ status: "failed", exitCode: 3 })),
            `Background command "npm test" failed with exit code 3`
        );
    });
    void it("bash killed", () => {
        assert.equal(
            completionSummary(mkJob({ status: "killed" })),
            `Background command "npm test" was stopped`
        );
    });
    void it("uses the job name as {desc} when set", () => {
        assert.equal(
            completionSummary(mkJob({ name: "tests", status: "completed", exitCode: 0 })),
            `Background command "tests" completed (exit code 0)`
        );
    });
    void it("monitor summaries", () => {
        const base = { kind: "monitor" as const, name: "API health" };
        assert.equal(
            completionSummary(mkJob({ ...base, status: "completed" })),
            `Monitor "API health" stream ended`
        );
        assert.equal(
            completionSummary(mkJob({ ...base, status: "failed", exitCode: 2 })),
            `Monitor "API health" script failed (exit 2)`
        );
        assert.equal(
            completionSummary(mkJob({ ...base, status: "killed" })),
            `Monitor "API health" stopped`
        );
    });
    void it("agent summaries", () => {
        const base = { kind: "agent" as const, command: "pi -p (background agent)" };
        assert.equal(
            completionSummary(mkJob({ ...base, status: "completed" })),
            `Agent "pi -p (background agent)" completed`
        );
        assert.equal(
            completionSummary(mkJob({ ...base, status: "failed", exitCode: 1 })),
            `Agent "pi -p (background agent)" failed: exit code 1`
        );
        assert.equal(
            completionSummary(mkJob({ ...base, status: "killed" })),
            `Agent "pi -p (background agent)" was stopped`
        );
    });
});

void describe("sendTaskNotification — exactly-once + eviction", () => {
    void it("sends the XML with steer delivery and evicts the job", () => {
        const { reg, pi, messages, deliverOptions } = harness();
        const job = mkJob({ id: "job-1-5", status: "completed", exitCode: 0 });
        add(reg, job);

        const sent = sendTaskNotification({ reg, pi: pi as never, job });

        assert.equal(sent, true);
        assert.equal(messages.length, 1);
        const m = messages[0];
        assert.equal(m.customType, EVENT.taskNotification);
        assert.equal(m.display, true);
        assert.equal(
            m.content,
            [
                "<task-notification>",
                "<task_id>job-1-5</task_id>",
                "<tool_use_id>tc-42</tool_use_id>",
                "<output_file>/tmp/pi-bg/job-1-1.log</output_file>",
                "<status>completed</status>",
                `<summary>Background command "npm test" completed (exit code 0)</summary>`,
                "</task-notification>",
            ].join("\n")
        );
        // Details carry the structured status/summary for the TUI renderer.
        assert.equal(m.details?.status, "completed");
        assert.equal(m.details?.summary, `Background command "npm test" completed (exit code 0)`);
        // Steer + triggerTurn — CC's 'next' priority, waking an idle agent.
        assert.deepEqual(deliverOptions[0], { deliverAs: "steer", triggerTurn: true });
        // Evicted: terminal + notified leaves the live registry.
        assert.equal(reg.jobs.has("job-1-5"), false);
        assert.equal(reg.recentTerminal.length, 1);
        assert.equal(reg.completedCount, 1);
    });

    void it("latches exactly-once: a second send is a no-op", () => {
        const { reg, pi, messages } = harness();
        const job = mkJob({});
        add(reg, job);
        sendTaskNotification({ reg, pi: pi as never, job });
        assert.equal(job.notified, true);
        const again = sendTaskNotification({ reg, pi: pi as never, job });
        assert.equal(again, false);
        assert.equal(messages.length, 1);
    });

    void it("kill suppression: a pre-latched job is skipped (and not evicted)", () => {
        const { reg, pi, messages } = harness();
        const job = mkJob({ status: "killed" });
        add(reg, job);
        markNotified(job); // kill path latches BEFORE the exit handler runs
        const sent = sendTaskNotification({ reg, pi: pi as never, job });
        assert.equal(sent, false);
        assert.equal(messages.length, 0);
        assert.equal(reg.jobs.has("job-1-1"), true, "lingers for the lazy sweep");
    });

    void it("evict: false keeps the job in the registry (monitor path)", () => {
        const { reg, pi, messages } = harness();
        const job = mkJob({ status: "running" as Job["status"] });
        add(reg, job);
        const sent = sendTaskNotification({
            reg,
            pi: pi as never,
            job,
            status: "completed",
            summary: `Monitor "watch" stream ended`,
            evict: false,
        });
        assert.equal(sent, true);
        assert.equal(reg.jobs.has("job-1-1"), true);
        assert.ok(messages[0].content.includes("<status>completed</status>"));
    });

    void it("a failed send does not retry and does not evict (exactly-once)", () => {
        const { reg, pi, messages } = harness({ deliverThrows: true });
        const job = mkJob({});
        add(reg, job);
        // Silence the module's console.error for the throw path.
        const origError = console.error;
        console.error = () => {};
        let sent = false;
        try {
            sent = sendTaskNotification({ reg, pi: pi as never, job });
        } finally {
            console.error = origError;
        }
        assert.equal(sent, false);
        assert.equal(messages.length, 0);
        assert.equal(job.notified, true, "latch already set — never retried");
        assert.equal(reg.jobs.has("job-1-1"), true);
    });
});

void describe("completeJob — exit-path notification", () => {
    void it("sends the <task-notification> the moment the job exits", () => {
        const { reg, pi, ctx, messages } = harness();
        const job = mkJob({ id: "job-9-1", status: "running", exitCode: undefined });
        add(reg, job);
        completeJob({ job, code: 0, reg, pi: pi as never, ctx });
        assert.equal(messages.length, 1);
        assert.ok(messages[0].content.includes("<status>completed</status>"));
        assert.equal(reg.jobs.has("job-9-1"), false, "evicted after the send");
    });

    void it("a job read before exit (notified) exits silently and lingers", () => {
        const { reg, pi, ctx, messages } = harness();
        const job = mkJob({ id: "job-9-2", status: "running", exitCode: undefined });
        add(reg, job);
        markNotified(job); // jobs output / attach raced the exit
        completeJob({ job, code: 1, reg, pi: pi as never, ctx });
        assert.equal(messages.length, 0);
        assert.equal(job.status, "failed");
        assert.equal(reg.jobs.has("job-9-2"), true);
    });

    void it("shouldNotify: false + notified evicts without sending (monitor path)", () => {
        const { reg, pi, ctx, messages } = harness();
        const job = mkJob({ id: "job-9-3", status: "running", exitCode: undefined });
        add(reg, job);
        markNotified(job); // monitor already sent its own terminal notification
        completeJob({ job, code: 0, reg, pi: pi as never, ctx, shouldNotify: false });
        assert.equal(messages.length, 0);
        assert.equal(reg.jobs.has("job-9-3"), false);
    });

    void it("shouldNotify: false without prior notice still evicts (bash_bg notify: false)", () => {
        const { reg, pi, ctx, messages } = harness();
        const job = mkJob({ id: "job-9-4", status: "running", exitCode: undefined });
        add(reg, job);
        // "Don't notify" IS notified — the job must not linger as a permanent
        // registry entry.
        completeJob({ job, code: 0, reg, pi: pi as never, ctx, shouldNotify: false });
        assert.equal(messages.length, 0);
        assert.equal(job.notified, true);
        assert.equal(reg.jobs.has("job-9-4"), false, "evicted — no permanent registry entry");
    });
});
