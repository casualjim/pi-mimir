/**
 * WebSocket source for the monitor tool.
 *
 * A ws monitor has no child process. Instead of spawning, it opens a WebSocket
 * and appends each incoming frame as a line to the same `<jobId>.log` the
 * line-follower reads — so ws and command monitors share one emitter path and
 * the existing jobs-list / attach / Read surface works unchanged.
 *
 * Compatibility: uses the runtime's global `WebSocket` (stable since Node 22).
 * When absent, isWsSupported() is false and the tool rejects the ws source with
 * an actionable error rather than crashing.
 */

import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";

export interface WsSpec {
    url: string;
    protocols?: string[];
}

export interface WsSource {
    /** Resolves when the socket closes (0 = clean close, 1 = error/abnormal). */
    exit: Promise<number>;
    /** Close the socket. Idempotent. */
    close: () => void;
}

/** True when the runtime provides a global WebSocket constructor. */
export function isWsSupported(): boolean {
    return typeof (globalThis as { WebSocket?: unknown }).WebSocket === "function";
}

/**
 * Open `spec.url`, appending each event as a line to `logPath`. The log file is
 * created (truncated) up front so the follower has something to stat. Returns
 * an exit promise (resolved on close) and a close handle.
 *
 * Throws synchronously if WebSocket is unsupported or construction fails — the
 * caller surfaces that as a tool error.
 */
export function openWsSource(spec: WsSpec, logPath: string): WsSource {
    if (!isWsSupported()) {
        throw new Error(
            "WebSocket is not available in this runtime (needs Node 22+). " +
                "Use a command source instead, e.g. " +
                `command: 'websocat ${spec.url}' or 'wscat -c ${spec.url}'.`
        );
    }

    // Ensure the log dir exists (a ws monitor may be the first background job of
    // the session, so LOG_DIR may not have been created by a spawn yet), then
    // hold one appendable fd open for the socket's lifetime — one writeSync per
    // frame instead of an open/write/close trio.
    mkdirSync(dirname(logPath), { recursive: true });
    const logFd = openSync(logPath, "w");
    let fdClosed = false;
    const closeFd = (): void => {
        if (fdClosed) return;
        fdClosed = true;
        try {
            closeSync(logFd);
        } catch {
            /* already closed */
        }
    };

    const append = (line: string): void => {
        if (fdClosed) return;
        try {
            writeSync(logFd, line.endsWith("\n") ? line : `${line}\n`);
        } catch {
            /* best-effort: a vanished log dir shouldn't take down the socket */
        }
    };

    const WS = (globalThis as { WebSocket: typeof WebSocket }).WebSocket;
    const ws = new WS(spec.url, spec.protocols);

    let settled = false;
    let resolveExit!: (code: number) => void;
    const exit = new Promise<number>((resolve) => {
        resolveExit = resolve;
    });
    const settle = (code: number): void => {
        if (settled) return;
        settled = true;
        closeFd();
        resolveExit(code);
    };

    ws.addEventListener("message", (ev: MessageEvent) => {
        const data: unknown = ev.data;
        if (typeof data === "string") {
            append(data);
        } else if (data instanceof ArrayBuffer) {
            append(`[binary frame, ${data.byteLength} bytes]`);
        } else if (data && typeof (data as { byteLength?: number }).byteLength === "number") {
            append(`[binary frame, ${(data as { byteLength: number }).byteLength} bytes]`);
        } else {
            append("[non-text frame]");
        }
    });

    ws.addEventListener("error", () => {
        append("[websocket error]");
        // Some implementations fire error without a following close.
        try {
            ws.close();
        } catch {
            /* already closing */
        }
        settle(1);
    });

    ws.addEventListener("close", (ev: CloseEvent) => {
        append(`[socket closed: code ${ev.code}${ev.reason ? ` ${ev.reason}` : ""}]`);
        settle(ev.code === 1000 || ev.code === 1005 ? 0 : 1);
    });

    return {
        exit,
        close() {
            try {
                ws.close();
            } catch {
                /* already closed */
            }
            settle(0);
        },
    };
}
