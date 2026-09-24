import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLastLine } from "../output.ts";
import { BackgroundRegistry } from "../state.ts";
import { add, renderSidebar, createRunningJob } from "../registry.ts";
import type { UiContext } from "../types.ts";

const dir = mkdtempSync(join(tmpdir(), "pi-progress-"));
const ESC = String.fromCharCode(27);

function tmpLog(name: string, content: string): string {
    const p = join(dir, name);
    writeFileSync(p, content);
    return p;
}

void describe("readLastLine — live progress source", () => {
    void it("returns the last non-empty line", () => {
        const p = tmpLog("a.log", "line one\nline two\nline three\n");
        assert.equal(readLastLine(p), "line three");
    });

    void it("ignores trailing blank lines", () => {
        const p = tmpLog("b.log", "real progress\n\n\n");
        assert.equal(readLastLine(p), "real progress");
    });

    void it("strips ANSI colour codes but keeps literal brackets (JSON)", () => {
        const p = tmpLog("c.log", `${ESC}[32m{"indexed":[1,2,3],"status":"grey"}${ESC}[0m\n`);
        assert.equal(readLastLine(p), '{"indexed":[1,2,3],"status":"grey"}');
    });

    void it("collapses a carriage-return progress bar to its final segment", () => {
        const p = tmpLog("d.log", "downloading 10%\rdownloading 50%\rdownloading 99%");
        assert.equal(readLastLine(p), "downloading 99%");
    });

    void it("strips OSC sequences, tabs, and stray control chars (no escape injection)", () => {
        const BEL = String.fromCharCode(7);
        const p = tmpLog(
            "f.log",
            `${ESC}]0;window-title${BEL}col1\tcol2${BEL} done\n`
        );
        const out = readLastLine(p);
        assert.doesNotMatch(out, /window-title/, "OSC title sequence stripped");
        assert.doesNotMatch(out, new RegExp(`[${ESC}${BEL}\\t]`), "no control chars remain");
        assert.match(out, /col1 col2 done/);
    });

    void it("returns empty string when there is no output yet", () => {
        const p = tmpLog("e.log", "");
        assert.equal(readLastLine(p), "");
    });

    void it("returns empty string for a missing file", () => {
        assert.equal(readLastLine(join(dir, "nope.log")), "");
    });
});

void describe("renderSidebar — pill shows live progress", () => {
    function ctxStub() {
        let widget: string[] | undefined;
        const ctx = {
            ui: {
                notify() {},
                setWidget: (_n: string, c: string[] | undefined) => { widget = c; },
                setStatus() {},
                theme: { fg: (_c: string, t: string) => t },
            },
        } as unknown as UiContext;
        return { ctx, getWidget: () => widget };
    }

    void it("renders the latest output line, not just the command", () => {
        const reg = new BackgroundRegistry();
        const logPath = tmpLog("job.log", "starting up\n{\"indexed\":8540629,\"status\":\"grey\"}\n");
        const job = createRunningJob({
            id: "job-1-1",
            command: "for i in $(seq 1 20); do poll; sleep 30; done",
            pid: 123,
            logPath,
            toolCallId: "t",
        });
        add(reg, job);

        const { ctx, getWidget } = ctxStub();
        renderSidebar(reg, ctx);

        const pill = getWidget()?.[0] ?? "";
        assert.match(pill, /indexed":8540629/, "shows the latest output line");
        assert.doesNotMatch(pill, /seq 1 20/, "not the raw command once there is output");
    });

    void it("falls back to the command when there is no output yet", () => {
        const reg = new BackgroundRegistry();
        const logPath = tmpLog("empty-job.log", "");
        const job = createRunningJob({
            id: "job-1-2",
            command: "npm run build",
            pid: 124,
            logPath,
            toolCallId: "t",
        });
        add(reg, job);

        const { ctx, getWidget } = ctxStub();
        renderSidebar(reg, ctx);
        assert.match(getWidget()?.[0] ?? "", /npm run build/);
    });

    void it("renders no pill for terminal jobs", () => {
        const reg = new BackgroundRegistry();
        const logPath = tmpLog("done-job.log", "done\n");
        const job = createRunningJob({
            id: "job-1-3",
            command: "npm test",
            pid: 125,
            logPath,
            toolCallId: "t",
        });
        add(reg, job);
        job.status = "completed";
        job.exitCode = 0;

        const { ctx, getWidget } = ctxStub();
        renderSidebar(reg, ctx);
        assert.equal(getWidget(), undefined, "no pills — a terminal job's outcome is always surfaced elsewhere");
        assert.equal(reg.sidebarTimer, undefined, "no ticker without running jobs");
    });

    void it("hides terminal jobs once notified", () => {
        const reg = new BackgroundRegistry();
        const logPath = tmpLog("notified-job.log", "done\n");
        const job = createRunningJob({
            id: "job-1-4",
            command: "npm test",
            pid: 126,
            logPath,
            toolCallId: "t",
        });
        add(reg, job);
        job.status = "killed";
        job.notified = true;

        const { ctx, getWidget } = ctxStub();
        renderSidebar(reg, ctx);
        assert.equal(getWidget(), undefined, "no pills at all — widget cleared");
    });
});

process.on("exit", () => {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
});
