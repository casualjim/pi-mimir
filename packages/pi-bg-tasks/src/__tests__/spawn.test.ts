// src/__tests__/spawn.test.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Will import from spawn.ts once created
// import { spawnWithFileOutput, killProcessTree, processExists } from "../spawn.ts";

const testDir = join(tmpdir(), `pi-bg-test-${process.pid}`);

describe("spawnWithFileOutput", () => {
    test("captures stdout to log file", async () => {
        const { spawnWithFileOutput } = await import("../spawn.ts");
        mkdirSync(testDir, { recursive: true });
        const logPath = join(testDir, "test-stdout.log");
        const result = spawnWithFileOutput({
            command: 'echo "hello world"',
            cwd: process.cwd(),
            logPath,
        });
        assert.ok(result.pid > 0);
        const { code } = await result.exit;
        assert.equal(code, 0);
        const output = readFileSync(logPath, "utf-8");
        assert.ok(output.includes("hello world"));
        unlinkSync(logPath);
    });

    test("captures stderr to same log file", async () => {
        const { spawnWithFileOutput } = await import("../spawn.ts");
        mkdirSync(testDir, { recursive: true });
        const logPath = join(testDir, "test-stderr.log");
        const result = spawnWithFileOutput({
            command: 'echo "err msg" >&2',
            cwd: process.cwd(),
            logPath,
        });
        const { code } = await result.exit;
        assert.equal(code, 0);
        const output = readFileSync(logPath, "utf-8");
        assert.ok(output.includes("err msg"));
        unlinkSync(logPath);
    });

    test("returns non-zero exit code on failure", async () => {
        const { spawnWithFileOutput } = await import("../spawn.ts");
        mkdirSync(testDir, { recursive: true });
        const logPath = join(testDir, "test-fail.log");
        const result = spawnWithFileOutput({
            command: "exit 42",
            cwd: process.cwd(),
            logPath,
        });
        const { code } = await result.exit;
        assert.equal(code, 42);
        try { unlinkSync(logPath); } catch {}
    });

    test("respects AbortSignal", async () => {
        const { spawnWithFileOutput } = await import("../spawn.ts");
        mkdirSync(testDir, { recursive: true });
        const logPath = join(testDir, "test-abort.log");
        const ac = new AbortController();
        const result = spawnWithFileOutput({
            command: "sleep 60",
            cwd: process.cwd(),
            logPath,
            signal: ac.signal,
        });
        // Give process time to start
        await new Promise((r) => setTimeout(r, 200));
        ac.abort();
        const { code, signal } = await result.exit;
        // Killed process: a signal death, or at least a non-zero code.
        assert.ok(signal !== null || code !== 0);
        try { unlinkSync(logPath); } catch {}
    });

    test("resolves when the shell exits even if a grandchild holds the fds", async () => {
        const { spawnWithFileOutput, killProcessTree } = await import("../spawn.ts");
        mkdirSync(testDir, { recursive: true });
        const logPath = join(testDir, "test-grandchild.log");
        // The shell daemonizes a child that inherits the log fd — with 'close'
        // this would hang for 30s; with 'exit' it resolves as soon as the
        // shell itself exits.
        const result = spawnWithFileOutput({
            command: "sleep 30 & echo started",
            cwd: process.cwd(),
            logPath,
        });
        try {
            const raced = await Promise.race([
                result.exit,
                new Promise<null>((r) => setTimeout(() => r(null), 3_000)),
            ]);
            assert.ok(raced !== null, "exit promise must resolve promptly, not after the grandchild");
            assert.equal(raced.code, 0);
        } finally {
            // Clean up the lingering grandchild.
            killProcessTree(result.pid, "SIGKILL");
        }
        try { unlinkSync(logPath); } catch {}
    });
});

describe("killProcessTree", () => {
    test("kills a running process", async () => {
        const { spawnWithFileOutput, killProcessTree, processExists } = await import("../spawn.ts");
        mkdirSync(testDir, { recursive: true });
        const logPath = join(testDir, "test-kill.log");
        const result = spawnWithFileOutput({
            command: "sleep 60",
            cwd: process.cwd(),
            logPath,
        });
        await new Promise((r) => setTimeout(r, 200));
        assert.ok(processExists(result.pid));
        killProcessTree(result.pid);
        await result.exit;
        // After exit, process should be gone (give OS a moment)
        await new Promise((r) => setTimeout(r, 100));
        assert.ok(!processExists(result.pid));
        try { unlinkSync(logPath); } catch {}
    });
});
