import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BackgroundRegistry } from "../state.ts";
import { takeControl, type ControlContext } from "../lifecycle.ts";

function harness(opts: { isIdle: boolean; hasPending: boolean; foreground?: boolean; foregroundCount?: number }) {
    const notices: { msg: string; level?: string }[] = [];
    let paused = 0;

    const ctx = {
        ui: { notify: (msg: string, level?: string) => notices.push({ msg, level }) },
        isIdle: () => opts.isIdle,
        hasPendingMessages: () => opts.hasPending,
    } as unknown as ControlContext;

    const reg = new BackgroundRegistry();
    if (opts.foreground) {
        const count = opts.foregroundCount ?? 1;
        for (let i = 1; i <= count; i++) {
            reg.foreground.set(`t${i}`, {
                requestPause: () => {
                    paused++;
                },
            });
        }
    }

    return { reg, ctx, notices, paused: () => paused };
}

void describe("takeControl — Ctrl+Shift+B (CC-faithful, never aborts)", () => {
    void it("backgrounds a foreground command and toasts (no synthetic agent message)", () => {
        const h = harness({ isIdle: false, hasPending: false, foreground: true });
        const outcome = takeControl(h.reg, h.ctx);
        assert.equal(outcome, "backgrounded");
        assert.equal(h.paused(), 1);
        assert.match(h.notices[0].msg, /continuing/);
        assert.equal(h.notices.length, 1, "only the UI toast — the tool result tells the model");
    });

    void it("backgrounds the foreground command even with a queued message (queue drains at turn end)", () => {
        const h = harness({ isIdle: false, hasPending: true, foreground: true });
        const outcome = takeControl(h.reg, h.ctx);
        assert.equal(outcome, "backgrounded");
        assert.equal(h.paused(), 1);
    });

    void it("backgrounds ALL running foreground commands (CC backgroundAll)", () => {
        const h = harness({ isIdle: false, hasPending: false, foreground: true, foregroundCount: 3 });
        const outcome = takeControl(h.reg, h.ctx);
        assert.equal(outcome, "backgrounded");
        assert.equal(h.paused(), 3, "every foreground slot is paused, not just the active one");
        assert.equal(h.reg.foreground.size, 0, "foreground map is cleared");
    });

    void it("sets expectations (not abort) when a message is queued but nothing is foregrounded", () => {
        const h = harness({ isIdle: false, hasPending: true, foreground: false });
        const outcome = takeControl(h.reg, h.ctx);
        assert.equal(outcome, "queued");
        assert.match(h.notices[0].msg, /current step finishes/);
    });

    void it("warns when there is nothing to background and nothing queued", () => {
        const h = harness({ isIdle: true, hasPending: false, foreground: false });
        const outcome = takeControl(h.reg, h.ctx);
        assert.equal(outcome, "nothing");
        assert.equal(h.notices[0].level, "warning");
        assert.match(h.notices[0].msg, /No running process/);
    });
});
