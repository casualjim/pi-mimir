import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { followLines } from "../monitor-follow.ts";

const dir = join(tmpdir(), `pi-bg-follow-${process.pid}`);
mkdirSync(dir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TICK = 15;

void describe("monitor-follow / followLines", () => {
    void it("emits only complete lines and holds a partial trailing line", async () => {
        const p = join(dir, "partial.log");
        writeFileSync(p, "");
        const batches: string[][] = [];
        const f = followLines(p, (lines) => batches.push(lines), TICK);

        appendFileSync(p, "alpha\nbeta\npar"); // 'par' has no newline yet
        await sleep(TICK * 3);
        assert.deepEqual(batches.flat(), ["alpha", "beta"]);

        appendFileSync(p, "tial\n"); // completes 'partial'
        await sleep(TICK * 3);
        f.stop();
        assert.deepEqual(batches.flat(), ["alpha", "beta", "partial"]);
    });

    void it("batches lines that land within one tick into a single event", async () => {
        const p = join(dir, "batch.log");
        writeFileSync(p, "");
        const batches: string[][] = [];
        const f = followLines(p, (lines) => batches.push(lines), TICK);

        appendFileSync(p, "one\ntwo\nthree\n");
        await sleep(TICK * 3);
        f.stop();
        assert.equal(batches.length, 1);
        assert.deepEqual(batches[0], ["one", "two", "three"]);
    });

    void it("tracks offset forward across successive appends", async () => {
        const p = join(dir, "offset.log");
        writeFileSync(p, "");
        const seen: string[] = [];
        const f = followLines(p, (lines) => seen.push(...lines), TICK);

        appendFileSync(p, "a\n");
        await sleep(TICK * 2);
        appendFileSync(p, "b\n");
        await sleep(TICK * 2);
        appendFileSync(p, "c\n");
        await sleep(TICK * 2);
        f.stop();
        assert.deepEqual(seen, ["a", "b", "c"]); // no re-emits
    });

    void it("flushes a final newline-less line on stop(true)", async () => {
        const p = join(dir, "flush.log");
        writeFileSync(p, "");
        const seen: string[] = [];
        const f = followLines(p, (lines) => seen.push(...lines), TICK);

        appendFileSync(p, "done\nlast-without-newline");
        await sleep(TICK * 2);
        f.stop(true);
        assert.deepEqual(seen, ["done", "last-without-newline"]);
    });

    void it("does not emit the trailing partial when stop() omits flush", async () => {
        const p = join(dir, "noflush.log");
        writeFileSync(p, "");
        const seen: string[] = [];
        const f = followLines(p, (lines) => seen.push(...lines), TICK);

        appendFileSync(p, "kept\ndropped-partial");
        await sleep(TICK * 2);
        f.stop(false);
        assert.deepEqual(seen, ["kept"]);
    });

    void it("tolerates a not-yet-created log file", async () => {
        const p = join(dir, "later.log");
        const seen: string[] = [];
        const f = followLines(p, (lines) => seen.push(...lines), TICK);
        await sleep(TICK * 2);
        writeFileSync(p, "finally\n");
        await sleep(TICK * 3);
        f.stop();
        assert.deepEqual(seen, ["finally"]);
    });
});

process.on("exit", () => {
    try {
        rmSync(dir, { recursive: true, force: true });
    } catch {
        /* best-effort */
    }
});
