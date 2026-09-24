/**
 * Line-accurate tail follower for the monitor tool.
 *
 * Unlike output.ts/pollFileTail (a bounded 4 KB tail deduped by content, fine
 * for progress display but lossy under bursts), this follower tracks a byte
 * offset forward from 0 and emits only *complete* newly-appended lines. A
 * partial trailing line is held until its newline arrives. Lines read within a
 * single poll tick are delivered together, so the poll cadence doubles as the
 * batch window.
 *
 * This is the single emitter path for both monitor sources: command monitors
 * append to the log via the child's stdout fd; ws monitors append each frame as
 * a line. The follower does not care which.
 */

import { closeSync, openSync, readSync, statSync } from "node:fs";
import { MONITOR_POLL_MS } from "./types.ts";

export interface MonitorFollower {
    /** Stop polling. When flush is true, do a final synchronous read and emit
     *  any remaining complete lines plus a trailing partial line (the process
     *  ended, so the last unterminated line is final). */
    stop(flush?: boolean): void;
}

/**
 * Follow `logPath`, invoking `onLines` with each batch of newly-completed
 * lines. Starts at offset 0. Reads are bounded by available bytes, not file
 * size history, so growth is O(new bytes) per tick.
 */
export function followLines(
    logPath: string,
    onLines: (lines: string[]) => void,
    intervalMs: number = MONITOR_POLL_MS
): MonitorFollower {
    let offset = 0;
    let remainder = "";
    let stopped = false;

    /** Read everything appended since `offset`, split into complete lines.
     *  Returns complete lines; updates offset and remainder. */
    function readNew(): string[] {
        let size: number;
        try {
            size = statSync(logPath).size;
        } catch {
            return []; // file not created yet
        }
        // Truncation/rotation: the file shrank below our offset. Reset so we
        // don't go permanently silent reading past the new end.
        if (size < offset) {
            offset = 0;
            remainder = "";
        }
        if (size <= offset) return [];

        const toRead = size - offset;
        // allocUnsafe is safe here: only the [0, n) slice that readSync fills is
        // ever consumed below.
        const buf = Buffer.allocUnsafe(toRead);
        let fd: number;
        try {
            fd = openSync(logPath, "r");
        } catch {
            return [];
        }
        try {
            const n = readSync(fd, buf, 0, toRead, offset);
            offset += n;
            const text = remainder + buf.toString("utf-8", 0, n);
            const parts = text.split("\n");
            remainder = parts.pop() ?? ""; // trailing partial (no newline yet)
            return parts;
        } finally {
            closeSync(fd);
        }
    }

    const timer = setTimeout(function tick() {
        if (stopped) return;
        const lines = readNew();
        if (lines.length > 0) onLines(lines);
        if (!stopped) timer.refresh();
    }, intervalMs);
    (timer as NodeJS.Timeout).unref();

    return {
        stop(flush = false) {
            if (stopped) return;
            stopped = true;
            clearTimeout(timer);
            if (flush) {
                const lines = readNew();
                // A non-empty remainder is a final, newline-less last line.
                if (remainder.length > 0) {
                    lines.push(remainder);
                    remainder = "";
                }
                if (lines.length > 0) onLines(lines);
            }
        },
    };
}
