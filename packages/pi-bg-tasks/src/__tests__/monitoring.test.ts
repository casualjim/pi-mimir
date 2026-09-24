import { describe, it, afterEach } from "node:test";
import { mock } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    looksLikePrompt,
    watchStalls,
} from "../monitoring.ts";
import {
    EVENT,
    STALL_CHECK_INTERVAL_MS,
    STALL_THRESHOLD_MS,
} from "../types.ts";

const TMP = join(tmpdir(), `pi-bg-stall-test-${process.pid}`);

interface SentMessage {
    customType?: string;
    content?: string;
}

interface DeliverOpts {
    deliverAs?: string;
    triggerTurn?: boolean;
}

function piHarness(sent: SentMessage[], opts?: DeliverOpts[]) {
    return {
        sendMessage: (m: SentMessage, o?: DeliverOpts) => {
            sent.push(m);
            if (o && opts) opts.push(o);
        },
    };
}

/** Advance the fake clock in stall-check steps — node:test mock timers only
 *  run timers scheduled inside a callback on the NEXT tick() call. */
function advance(ms: number): void {
    for (let elapsed = 0; elapsed < ms; elapsed += STALL_CHECK_INTERVAL_MS) {
        mock.timers.tick(STALL_CHECK_INTERVAL_MS);
    }
}

void describe("looksLikePrompt — CC prompt patterns", () => {
    void it("matches the interactive-prompt set on the last line", () => {
        assert.equal(looksLikePrompt("Continue? (y/n)"), true);
        assert.equal(looksLikePrompt("Overwrite? [y/n]"), true);
        assert.equal(looksLikePrompt("Proceed (yes/no)?"), true);
        assert.equal(looksLikePrompt("Do you want to continue?"), true);
        assert.equal(looksLikePrompt("Are you sure?"), true);
        assert.equal(looksLikePrompt("Ready to apply changes?"), true);
        assert.equal(looksLikePrompt("Press Enter to continue"), true);
        assert.equal(looksLikePrompt("Press any key to exit"), true);
        assert.equal(looksLikePrompt("Continue?"), true);
        assert.equal(looksLikePrompt("Overwrite?"), true);
        // Only the LAST line matters.
        assert.equal(looksLikePrompt("noise\nmore noise\nDo you agree?"), true);
    });

    void it("stays silent on ordinary output (merely-slow commands)", () => {
        assert.equal(looksLikePrompt("compiling module foo"), false);
        assert.equal(looksLikePrompt("downloading 42%"), false);
        assert.equal(looksLikePrompt(""), false);
        assert.equal(looksLikePrompt("the y/n debate continues"), false);
    });
});

void describe("watchStalls — 45s latch (fake timers)", () => {
    afterEach(() => {
        mock.timers.reset();
        rmSync(TMP, { recursive: true, force: true });
    });

    void it("fires once after 45s of zero growth on a prompt-like tail, then latches", () => {
        mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
        mkdirSync(TMP, { recursive: true });
        const logPath = join(TMP, "stall.log");
        writeFileSync(logPath, "installing deps\nContinue? (y/n)\n");

        const sent: SentMessage[] = [];
        const opts: DeliverOpts[] = [];
        const cancel = watchStalls({
            jobId: "job-1",
            command: "npm install",
            logPath,
            pi: piHarness(sent, opts) as never,
        });

        // Below the threshold — silent.
        advance(STALL_THRESHOLD_MS - 10_000);
        assert.equal(sent.length, 0);

        // Cross the threshold — fires with CC's statusless <task-notification>.
        advance(10_000 + STALL_CHECK_INTERVAL_MS);
        assert.equal(sent.length, 1);
        const content = sent[0].content ?? "";
        // CC omits <status> deliberately — the job is still running.
        const expectedHead = [
            "<task-notification>",
            "<task_id>job-1</task_id>",
            `<output_file>${logPath}</output_file>`,
            `<summary>Background command "npm install" appears to be waiting for interactive input</summary>`,
            "</task-notification>",
        ].join("\n");
        assert.ok(content.startsWith(expectedHead), `content starts with the XML block:\n${content}`);
        assert.ok(!content.includes("<status>"), "no status tag on a stall warning");
        assert.ok(!content.includes("tool_use_id"), "no tool_use_id on a stall warning");
        assert.ok(content.includes("Last output:\ninstalling deps\nContinue? (y/n)"));
        assert.ok(content.includes("Kill this task and re-run with piped input"));
        assert.ok(content.includes("or a non-interactive flag if one exists."));
        // Same channel and delivery as completions: task-notification, steer + wake.
        assert.equal(sent[0].customType, EVENT.taskNotification);
        assert.deepEqual(opts[0], { deliverAs: "steer", triggerTurn: true });

        // Latched — never fires twice.
        advance(STALL_THRESHOLD_MS * 2);
        assert.equal(sent.length, 1);
        cancel();
    });

    void it("uses the job name as the description when set", () => {
        mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
        mkdirSync(TMP, { recursive: true });
        const logPath = join(TMP, "named.log");
        writeFileSync(logPath, "Overwrite?\n");

        const sent: SentMessage[] = [];
        const cancel = watchStalls({
            jobId: "job-2",
            command: "cp a b",
            name: "copy-config",
            logPath,
            pi: piHarness(sent) as never,
        });

        advance(STALL_THRESHOLD_MS + STALL_CHECK_INTERVAL_MS);
        assert.equal(sent.length, 1);
        assert.ok((sent[0].content ?? "").includes('Background command "copy-config"'));
        cancel();
    });

    void it("stays silent on a merely-slow command (no prompt pattern)", () => {
        mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
        mkdirSync(TMP, { recursive: true });
        const logPath = join(TMP, "slow.log");
        writeFileSync(logPath, "downloading 42%\n");

        const sent: SentMessage[] = [];
        const cancel = watchStalls({
            jobId: "job-3",
            command: "curl big-file",
            logPath,
            pi: piHarness(sent) as never,
        });

        advance(STALL_THRESHOLD_MS * 4);
        assert.equal(sent.length, 0);
        cancel();
    });

    void it("output growth resets the stall clock", () => {
        mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
        mkdirSync(TMP, { recursive: true });
        const logPath = join(TMP, "growing.log");
        writeFileSync(logPath, "working\n");

        const sent: SentMessage[] = [];
        const cancel = watchStalls({
            jobId: "job-4",
            command: "build",
            logPath,
            pi: piHarness(sent) as never,
        });

        // Grow the file every 30s (under the 45s threshold) — never stalls.
        for (let i = 0; i < 5; i++) {
            advance(30_000);
            appendFileSync(logPath, `progress ${i}\n`);
        }
        assert.equal(sent.length, 0);
        cancel();
    });
});
