/**
 * Keyboard shortcut registration.
 *
 *   - Ctrl+Shift+B: move the foreground bash to background
 *   - Ctrl+Shift+J / Shift+Down: open the background task manager
 *   - Ctrl+Shift+X: kill the most recent running job
 *
 * Note: Ctrl+B is reserved by pi for `tui.editor.cursorLeft` (built-in
 * keybinding), so the background shortcut lives on Ctrl+Shift+B. Registering
 * Ctrl+B anyway triggers pi's startup "extension shortcut conflict" diagnostic
 * and breaks cursor-left in the editor.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { BackgroundRegistry } from "./state.ts";
import {
    takeControl,
    terminateJobSilently,
    type ControlContext,
} from "./lifecycle.ts";
import { renderSidebar } from "./registry.ts";
import { jobLabel } from "./format.ts";
import { openBgListPanel } from "./ui.ts";

/** Register all shortcuts. */
export function registerShortcuts(
    pi: ExtensionAPI,
    reg: BackgroundRegistry
): void {
    // Background shortcut — Ctrl+Shift+B. Ctrl+B itself is pi's built-in
    // cursor-left binding and must not be claimed (see header note).
    pi.registerShortcut("ctrl+shift+b", {
        description: "Background the current foreground process",
        handler: async (ctx) => handleCtrlB(reg, ctx),
    });

    pi.registerShortcut("ctrl+shift+j", {
        description: "Open background task manager",
        handler: async (ctx) => openBgListPanel(reg, ctx),
    });

    pi.registerShortcut("shift+down", {
        description: "Open background task manager",
        handler: async (ctx) => openBgListPanel(reg, ctx),
    });

    pi.registerShortcut("ctrl+shift+x", {
        description: "Kill the most recent running background job",
        handler: async (ctx) => handleCtrlX(reg, ctx),
    });
}

/**
 * Ctrl+Shift+B / `/bg` handler — background ALL running foreground commands
 * (Claude Code's `backgroundAll`). takeControl deliberately never aborts the
 * turn: the bash tool returns its "backgrounded" result, the turn ends, and a
 * queued user message drains at the natural turn boundary. See
 * lifecycle.takeControl.
 */
async function handleCtrlB(
    reg: BackgroundRegistry,
    ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerShortcut"]>[1]["handler"]>>[0]
): Promise<void> {
    takeControl(reg, ctx as ControlContext);
}

/** Ctrl+Shift+X: kill the most recent running job. */
async function handleCtrlX(
    reg: BackgroundRegistry,
    ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerShortcut"]>[1]["handler"]>>[0]
): Promise<void> {
    const running = Array.from(reg.jobs.values())
        .filter((j) => j.status === "running")
        .sort((a, b) => b.startTime - a.startTime);

    if (running.length === 0) {
        ctx.ui.notify("No running tasks to kill", "warning");
        return;
    }

    const target = running[0];
    terminateJobSilently(reg, target);
    renderSidebar(reg, ctx);
    ctx.ui.notify(`Killed ${jobLabel(target)}`, "info");
}
