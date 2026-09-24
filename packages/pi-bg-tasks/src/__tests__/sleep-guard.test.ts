import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectBlockedSleep } from "../lifecycle.ts";
import { BackgroundRegistry } from "../state.ts";
import { registerBashBgTool } from "../tools/bash-bg.ts";

void describe("detectBlockedSleep — naive-wait detection", () => {
    void it("blocks a standalone long sleep", () => {
        assert.equal(detectBlockedSleep("sleep 600"), "sleep 600");
        assert.equal(detectBlockedSleep("sleep 2"), "sleep 2");
    });

    void it("blocks an EMBEDDED top-level sleep (the lingering-job case)", () => {
        // cd is first, so the old leading-only check missed this.
        assert.equal(
            detectBlockedSleep("cd /repo; sleep 600; cat log; echo done"),
            "sleep 600"
        );
        assert.equal(detectBlockedSleep("build && sleep 5 && test"), "sleep 5");
        assert.equal(detectBlockedSleep("cd x || sleep 30"), "sleep 30");
    });

    void it("blocks a newline-separated sleep (bash's primary separator)", () => {
        assert.equal(detectBlockedSleep("npm run dev &\nsleep 5\ncurl localhost:3000"), "sleep 5");
        assert.equal(detectBlockedSleep("make\nsleep 30\nmake test"), "sleep 30");
    });

    void it("blocks a backgrounded sleep (sleep 600 &)", () => {
        assert.equal(detectBlockedSleep("sleep 600 &"), "sleep 600");
        assert.equal(detectBlockedSleep("start; sleep 600 &\ncheck"), "sleep 600");
    });

    void it("blocks minute/hour/day durations regardless of number", () => {
        assert.equal(detectBlockedSleep("sleep 5m"), "sleep 5m");
        assert.equal(detectBlockedSleep("setup; sleep 1h; check"), "sleep 1h");
    });

    void it("allows sub-2s and float sleeps (deliberate pacing)", () => {
        assert.equal(detectBlockedSleep("sleep 1"), null);
        assert.equal(detectBlockedSleep("sleep 0.5"), null);
        assert.equal(detectBlockedSleep("cmd; sleep 1; cmd"), null);
    });

    void it("NEVER flags a sleep inside a polling loop (the correct pattern)", () => {
        assert.equal(detectBlockedSleep("until grep -q READY log; do sleep 1; done"), null);
        assert.equal(detectBlockedSleep("while ! curl -sf localhost; do sleep 5; done"), null);
        assert.equal(detectBlockedSleep("for i in 1 2 3; do work; sleep 5; done"), null);
    });

    void it("does not flag a sleep inside a pipeline or subshell", () => {
        assert.equal(detectBlockedSleep("sleep 5 | tee x"), null);
        assert.equal(detectBlockedSleep("(sleep 5; cmd)"), null);
    });

    void it("allows commands with no sleep", () => {
        assert.equal(detectBlockedSleep("npm run build && npm test"), null);
        assert.equal(detectBlockedSleep("echo sleeping; echo done"), null);
    });
});

void describe("bash_bg — rejects a backgrounded sleep wait", () => {
    function bashBg() {
        let tool: { execute: (id: string, p: unknown, s: unknown, u: unknown, c: unknown) => Promise<unknown> } | undefined;
        const pi = { registerTool: (def: typeof tool) => { tool = def; }, sendMessage() {} };
        registerBashBgTool(pi as never, new BackgroundRegistry());
        const ctx = {
            cwd: process.cwd(),
            ui: { notify() {}, setWidget() {}, setStatus() {}, theme: { fg: (_c: string, t: string) => t } },
        };
        return { tool: tool!, ctx };
    }

    void it("blocks an embedded sleep in bash_bg (previously unguarded)", async () => {
        const { tool, ctx } = bashBg();
        await assert.rejects(
            () => tool.execute("t1", { command: "cd /repo; sleep 600; cat log" }, undefined, undefined, ctx),
            /Blocked: sleep 600.*jobs action='attach'/s
        );
    });

    void it("still allows a real backgrounded command", async () => {
        const { tool, ctx } = bashBg();
        const res = await tool.execute("t2", { command: "echo hi" }, undefined, undefined, ctx);
        assert.ok(res, "non-sleep command runs");
    });
});
