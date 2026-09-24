import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerInputHandlers } from "../input.ts";
import { BackgroundRegistry } from "../state.ts";
import type { UiContext } from "../types.ts";

interface ResubmittedMessage {
    text: string;
    deliverAs?: string;
}

type InputHandler = (
    event: {
        type: "input";
        text: string;
        source: "interactive" | "rpc" | "extension";
        streamingBehavior?: "steer" | "followUp";
    },
    ctx: UiContext & {
        abort(): void;
        signal?: AbortSignal;
    }
) => Promise<
    | { action: "continue" }
    | { action: "transform"; text: string }
    | { action: "handled" }
>;

void describe("input steering (cooperative scheduler)", () => {
    void it("aborts the turn, backgrounds the job, and resubmits the message as a followUp", async () => {
        const reg = new BackgroundRegistry();
        const sent: { customType?: string }[] = [];
        const resubmitted: ResubmittedMessage[] = [];
        const notifications: string[] = [];
        let pauseReason: string | undefined;
        let abortCalled = false;
        const handler = registerAndGetHandler(reg, sent, resubmitted);
        reg.foreground.set("tc-steer", {
            requestPause: (reason) => {
                pauseReason = reason;
            },
        });

        const result = await handler(
            {
                type: "input",
                text: "stop and inspect the last failure",
                source: "interactive",
                streamingBehavior: "steer",
            },
            makeCtx(notifications, { abort: () => { abortCalled = true; } })
        );

        assert.equal(result.action, "handled");
        assert.equal(pauseReason, "manual");
        assert.equal(abortCalled, true);
        // Steering suppresses the synthetic "backgrounded, continue working"
        // notice — the user's own resubmitted message drives the next turn,
        // so no redundant agent message is sent.
        assert.equal(sent.length, 0);
        assert.deepEqual(resubmitted, [
            { text: "stop and inspect the last failure", deliverAs: "followUp" },
        ]);
    });

    void it("second input while still active does not double-background or double-resubmit", async () => {
        const reg = new BackgroundRegistry();
        const sent: { customType?: string }[] = [];
        const resubmitted: ResubmittedMessage[] = [];
        const notifications: string[] = [];
        let abortCalls = 0;
        const handler = registerAndGetHandler(reg, sent, resubmitted);
        reg.foreground.set("tc-steer2", {
            requestPause: () => {},
        });

        const r1 = await handler(
            { type: "input", text: "first", source: "interactive", streamingBehavior: "steer" },
            makeCtx(notifications, { abort: () => { abortCalls++; } })
        );
        const r2 = await handler(
            { type: "input", text: "second", source: "interactive", streamingBehavior: "steer" },
            makeCtx(notifications, { abort: () => { abortCalls++; } })
        );

        assert.equal(r1.action, "handled");
        assert.equal(r2.action, "continue");
        // No synthetic agent messages are sent during steering (only the user's
        // resubmitted text), and the second input is ignored (no active slot).
        assert.equal(sent.length, 0);
        assert.equal(abortCalls, 1);
        assert.deepEqual(resubmitted, [{ text: "first", deliverAs: "followUp" }]);
    });

    void it("returns continue when no cooperative foreground task is active", async () => {
        const reg = new BackgroundRegistry();
        const sent: { customType?: string }[] = [];
        const resubmitted: ResubmittedMessage[] = [];
        const handler = registerAndGetHandler(reg, sent, resubmitted);

        const result = await handler(
            { type: "input", text: "any steering", source: "interactive", streamingBehavior: "steer" },
            makeCtx([], { abort: () => {} })
        );

        assert.deepEqual(result, { action: "continue" });
        assert.equal(sent.length, 0);
        assert.equal(resubmitted.length, 0);
    });

    void it("ignores extension-sourced input (recursion guard)", async () => {
        const reg = new BackgroundRegistry();
        const sent: { customType?: string }[] = [];
        const resubmitted: ResubmittedMessage[] = [];
        const handler = registerAndGetHandler(reg, sent, resubmitted);
        reg.foreground.set("tc-ext", {
            requestPause: () => {},
        });

        const result = await handler(
            { type: "input", text: "self-resubmit", source: "extension", streamingBehavior: "steer" },
            makeCtx([], { abort: () => {} })
        );

        assert.deepEqual(result, { action: "continue" });
        assert.equal(sent.length, 0);
        assert.equal(resubmitted.length, 0);
    });
});

function registerAndGetHandler(
    reg: BackgroundRegistry,
    sent: { customType?: string }[],
    resubmitted: ResubmittedMessage[]
): InputHandler {
    let handler: InputHandler | undefined;
    registerInputHandlers(
        {
            on(event: string, fn: InputHandler) {
                if (event === "input") handler = fn;
            },
            sendMessage(message: { customType?: string }) {
                sent.push(message);
            },
            sendUserMessage(content: string | object[], options?: { deliverAs?: string }) {
                if (typeof content === "string") {
                    resubmitted.push({ text: content, deliverAs: options?.deliverAs });
                }
            },
        } as never,
        reg
    );
    assert.ok(handler);
    return handler;
}

function makeCtx(
    notifications: string[] = [],
    actions?: { abort(): void }
): UiContext & { abort(): void } {
    return {
        ui: {
            notify: (message) => notifications.push(message),
            setWidget: () => {},
            setStatus: () => {},
            theme: { fg: (_colour, text) => text },
            select: async () => undefined,
            editor: async () => undefined,
        },
        abort: actions?.abort ?? (() => {}),
    };
}
