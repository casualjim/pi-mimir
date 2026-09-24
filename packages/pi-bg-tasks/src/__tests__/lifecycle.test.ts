/**
 * Unit tests for spawn.ts process primitives and lifecycle.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { killProcessTree, processExists } from "../spawn.ts";
import {
    abortJob,
    backgroundActiveForeground,
    createJobAbort,
    ensureCompletionPromise,
    markKilledSilently,
    markTerminal,
    statusFromExit,
} from "../lifecycle.ts";
import { BackgroundRegistry } from "../state.ts";
import { type Job, type UiContext } from "../types.ts";

void describe("processExists", () => {
    void it("the current process is alive", () => {
        assert.equal(processExists(process.pid), true);
    });
    void it("PID 0 is treated as dead", () => {
        assert.equal(processExists(0), false);
    });
    void it("a negative PID is treated as dead", () => {
        assert.equal(processExists(-1), false);
    });
    void it("undefined is treated as dead", () => {
        assert.equal(processExists(undefined), false);
    });
});

void describe("killProcessTree", () => {
    void it("PID 0 / negative / undefined are no-ops", () => {
        // Must not throw.
        killProcessTree(0);
        killProcessTree(-1);
        killProcessTree(undefined);
        killProcessTree(12345678, "SIGTERM"); // dead PID — must not throw.
    });
});

void describe("statusFromExit", () => {
    void it("0 → completed", () => {
        assert.equal(statusFromExit(0), "completed");
    });
    void it("1 → failed", () => {
        assert.equal(statusFromExit(1), "failed");
    });
    void it("a signal death → killed (external kill, OOM — never completed)", () => {
        assert.equal(statusFromExit(null, "SIGKILL"), "killed");
        assert.equal(statusFromExit(null, "SIGTERM"), "killed");
    });
    void it("a signal wins over a code", () => {
        assert.equal(statusFromExit(0, "SIGKILL"), "killed");
    });
    void it("null without a signal → failed (the spawn-error path passes code 1)", () => {
        assert.equal(statusFromExit(null), "failed");
    });
    void it("undefined → failed", () => {
        assert.equal(statusFromExit(undefined), "failed");
    });
});

void describe("markTerminal idempotency", () => {
    void it("a second call after completion is ignored", () => {
        const job = makeJob();
        markTerminal(job, "completed", 0);
        markTerminal(job, "failed", 1);
        assert.equal(job.status, "completed");
        assert.equal(job.exitCode, 0);
    });
    void it("killed → killed", () => {
        const job = makeJob();
        markTerminal(job, "killed");
        assert.equal(job.status, "killed");
    });
});

function makeJob(overrides: Partial<Job> = {}): Job {
    return {
        id: "job-mt-1",
        command: "x",
        pid: 1,
        startTime: 0,
        status: "running",
        logPath: "/tmp/x",
        toolCallId: "tc-1",
        isBackgrounded: false,
        ...overrides,
    };
}

void describe("ensureCompletionPromise", () => {
    void it("creates donePromise resolvable via resolveDone", async () => {
        const job = makeJob();
        ensureCompletionPromise(job);
        assert.ok(job.donePromise);
        assert.ok(job.resolveDone);
        let resolved = false;
        void job.donePromise.then(() => {
            resolved = true;
        });
        job.resolveDone!();
        await job.donePromise;
        assert.equal(resolved, true);
    });
});

void describe("markKilledSilently", () => {
    void it("status=killed, notified=true", () => {
        const job = makeJob();
        markKilledSilently(job);
        assert.equal(job.status, "killed");
        assert.equal(job.notified, true);
    });
});

void describe("createJobAbort / abortJob", () => {
    void it("registers a controller and is idempotent", () => {
        const reg = new BackgroundRegistry();
        const a = createJobAbort(reg, "job-1");
        const b = createJobAbort(reg, "job-1");
        assert.equal(a, b);
        assert.equal(reg.jobAborts.get("job-1"), a);
        assert.equal(a.signal.aborted, false);
    });
    void it("abortJob aborts the signal and removes the controller", () => {
        const reg = new BackgroundRegistry();
        const ac = createJobAbort(reg, "job-2");
        let aborted = false;
        ac.signal.addEventListener("abort", () => {
            aborted = true;
        });
        abortJob(reg, "job-2");
        assert.equal(aborted, true);
        assert.equal(ac.signal.aborted, true);
        assert.equal(reg.jobAborts.has("job-2"), false);
    });
    void it("abortJob on an unknown job is a no-op", () => {
        const reg = new BackgroundRegistry();
        abortJob(reg, "nope"); // must not throw
        assert.equal(reg.jobAborts.has("nope"), false);
    });
});

void describe("BackgroundRegistry defaults", () => {
    void it("initializes default fields", () => {
        const reg = new BackgroundRegistry();
        assert.ok(reg.jobs instanceof Map);
        assert.ok(reg.foreground instanceof Map);
        assert.ok(reg.jobAborts instanceof Map);
        assert.equal(reg.totalStarted, 0);
    });
});

void describe("backgroundActiveForeground", () => {
    void it("manual background pauses the slot and toasts — no synthetic agent message", () => {
        const reg = new BackgroundRegistry();
        const notifications: string[] = [];
        let pauseReason: string | undefined;
        reg.foreground.set("tc-manual", {
            requestPause: (reason) => {
                pauseReason = reason;
            },
        });

        const ok = backgroundActiveForeground(reg, makeCtx(notifications));

        assert.equal(ok, true);
        assert.equal(pauseReason, "manual");
        assert.equal(notifications[0], "▶ Backgrounded — continuing.");
    });
});

function makeCtx(notifications: string[] = []): UiContext {
    return {
        ui: {
            notify: (message) => notifications.push(message),
            setWidget: () => {},
            setStatus: () => {},
            theme: { fg: (_colour, text) => text },
            select: async () => undefined,
            editor: async () => undefined,
        },
    };
}
