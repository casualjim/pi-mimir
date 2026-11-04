// src/input.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { BackgroundRegistry } from "./state.ts";
import type { UiContext } from "./types.ts";
import { backgroundActiveForeground } from "./lifecycle.ts";

export function registerInputHandlers(pi: ExtensionAPI, reg: BackgroundRegistry): void {
    pi.on("input", async (event, ctx) => {
        // Cooperative steering (Claude Code parity): ANY input typed while a
        // foreground bash command is running backgrounds that command and
        // re-delivers the input as the next turn — regardless of the message's
        // steer/followUp streamingBehavior. We only intercept when a foreground
        // slot is active; everything else falls through to Pi.
        if (reg.foreground.size === 0) return { action: "continue" };
        // Don't intercept extension-sourced messages.
        if (event.source === "extension") return { action: "continue" };

        const text = event.text;
        const bg = backgroundActiveForeground(reg, ctx as UiContext);
        if (!bg) return { action: "continue" };

        // No ctx.abort() here. The pause above already makes the bash tool return
        // its normal "backgrounded" result (tools/bash.ts pauseRequested path), so
        // aborting is not what ends the command — it only cancels the run. Aborting
        // also drains queued steering/followUp messages into the editor and makes
        // the turn end as an error, which extensions that treat a failed turn as
        // terminal (goal runs) read as a hard stop. takeControl() documents the same
        // hazard; this path should follow it.

        // Resubmit the user's message as a follow-up — Pi delivers it
        // after the current turn settles. No polling needed.
        try {
            pi.sendUserMessage(text, { deliverAs: "followUp" });
        } catch {
            // Session ended between abort and resubmit — nothing to deliver to.
        }

        return { action: "handled" };
    });
}
