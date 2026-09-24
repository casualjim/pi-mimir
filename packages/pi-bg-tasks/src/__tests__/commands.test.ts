import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BackgroundRegistry } from "../state.ts";
import { registerCommands } from "../commands.ts";

void describe("commands", () => {
    void it("/bg-version reports the loaded package version and path", async () => {
        const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
        const notices: string[] = [];
        const pi = {
            registerCommand(name: string, definition: { handler: (args: string, ctx: unknown) => Promise<void> }) {
                commands.set(name, definition);
            },
            sendMessage() { },
        };

        registerCommands(pi as never, new BackgroundRegistry());
        await commands.get("bg-version")?.handler("", {
            ui: {
                notify: (message: string) => notices.push(message),
            },
        });

        assert.ok(commands.has("bg"));
        assert.ok(commands.has("bg-list"));
        assert.ok(commands.has("bg-version"));
        assert.match(notices[0], /^@casualjim\/pi-bg-tasks@\d+\.\d+\.\d+ loaded from /);
        assert.match(notices[0], /pi-bg-tasks$/);
    });
});
