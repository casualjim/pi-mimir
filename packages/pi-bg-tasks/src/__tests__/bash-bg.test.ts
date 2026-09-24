/**
 * `bash_bg` tool — timeout kill must be loud: a log marker plus a killed
 * <task-notification>, mirroring the foreground bash timeout path (the agent
 * must learn its command was timeout-killed).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BackgroundRegistry } from "../state.ts";
import { registerBashBgTool } from "../tools/bash-bg.ts";
import { EVENT } from "../types.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ToolDef {
    execute: (
        toolCallId: string,
        params: unknown,
        signal: unknown,
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
    registerBashBgTool(pi as never, reg);
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

void describe("bash_bg — timeout kill is loud", () => {
    void it("marks the log AND sends a killed <task-notification>", async () => {
        const { tool, ctx, messages } = harness();
        // `sleep` is excluded from auto-backgrounding, and a float duration
        // slips past the blocked-sleep guard — so the timeout hits the kill
        // path (same trick as the foreground timeout test).
        const res = await tool.execute(
            "t1",
            { command: "sleep 1.5", timeout: 1 },
            undefined,
            undefined,
            ctx
        );
        const logPath = /Output is being written to: (\S+)/.exec(res.content[0].text)?.[1];
        assert.ok(logPath, "tool result carries the log path");

        await sleep(1_600); // the 1s timeout fires, SIGTERM, exit handler notifies

        const terminals = messages.filter((m) => m.customType === EVENT.taskNotification);
        assert.equal(terminals.length, 1, "the agent learns its command was timeout-killed");
        assert.ok(terminals[0].content.includes("<status>killed</status>"));
        assert.ok(terminals[0].content.includes("was stopped"));
        assert.match(
            readFileSync(logPath, "utf-8"),
            /Command timed out after 1s/,
            "log marker tells a timeout kill apart from a normal failure"
        );
    });
});
