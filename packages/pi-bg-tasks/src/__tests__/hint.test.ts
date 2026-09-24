import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { showBackgroundHint, clearBackgroundHint } from "../hint.ts";
import type { UiContext } from "../types.ts";

interface WidgetCall {
    name: string;
    content: string[] | undefined;
    options?: { placement?: string };
}

function makeCtx(): { calls: WidgetCall[]; ctx: UiContext } {
    const calls: WidgetCall[] = [];
    const ctx = {
        ui: {
            notify: () => {},
            setWidget: (name: string, content: string[] | undefined, options?: { placement?: string }) =>
                calls.push({ name, content, options }),
            setStatus: () => {},
            theme: { fg: (_c: string, t: string) => t },
            select: async () => undefined,
            editor: async () => undefined,
        },
    } as unknown as UiContext;
    return { calls, ctx };
}

function withTmux(value: string | undefined, fn: () => void): void {
    const prev = process.env.TMUX;
    if (value === undefined) delete process.env.TMUX;
    else process.env.TMUX = value;
    try {
        fn();
    } finally {
        if (prev === undefined) delete process.env.TMUX;
        else process.env.TMUX = prev;
    }
}

void describe("background hint", () => {
    void it("shows a ctrl+shift+b hint below the editor", () => {
        withTmux(undefined, () => {
            const { calls, ctx } = makeCtx();
            showBackgroundHint(ctx);
            assert.equal(calls.length, 1);
            assert.equal(calls[0].options?.placement, "belowEditor");
            const line = calls[0].content?.[0] ?? "";
            assert.match(line, /ctrl\+shift\+b to run in background/);
            clearBackgroundHint(ctx); // balance the ref-count
        });
    });

    void it("shows the same hint inside tmux (no double-press note)", () => {
        withTmux("/tmp/tmux-1/default,123,0", () => {
            const { calls, ctx } = makeCtx();
            showBackgroundHint(ctx);
            const line = calls[0].content?.[0] ?? "";
            assert.match(line, /ctrl\+shift\+b to run in background/);
            assert.ok(!/twice/.test(line));
            clearBackgroundHint(ctx);
        });
    });

    void it("ref-counts: stays up until the last parallel command clears", () => {
        const { calls, ctx } = makeCtx();
        showBackgroundHint(ctx); // 0 -> 1: renders
        showBackgroundHint(ctx); // 1 -> 2: no extra render
        assert.equal(calls.length, 1, "only the first show renders the widget");
        clearBackgroundHint(ctx); // 2 -> 1: still up
        assert.equal(calls.length, 1, "hint stays while a command remains");
        clearBackgroundHint(ctx); // 1 -> 0: clears
        assert.equal(calls.length, 2);
        assert.equal(calls[1].content, undefined);
    });

    void it("clear is a no-op when nothing is shown", () => {
        const { calls, ctx } = makeCtx();
        clearBackgroundHint(ctx);
        assert.equal(calls.length, 0);
    });
});
