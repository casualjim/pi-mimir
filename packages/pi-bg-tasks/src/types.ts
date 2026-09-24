/**
 * Type definitions and shared constants for the background-tasks extension.
 */

import type { ChildProcess } from "node:child_process";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";

// --- Configuration constants ---
export const DEFAULT_TIMEOUT_MS = 120_000;
export const QUICK_COMPLETION_MS = 2_000;
export const FOREGROUND_TAIL_BYTES = 4_096;
export const STALL_CHECK_INTERVAL_MS = 5_000;
export const STALL_THRESHOLD_MS = 45_000;
export const STALL_TAIL_BYTES = 1024;
export const MAX_LOG_BYTES = 100 * 1024 * 1024;
export const OUTPUT_PREVIEW_CHARS = 12_000;
export const RECENT_TERMINAL_KEEP = 20;
export const MAX_CONCURRENT_JOBS = 16;

// --- Monitor (streaming-event) constants ---
/** Poll cadence for the line-accurate follower. Lines read within one tick are
 *  batched into a single event — so this doubles as the ~200ms batch window. */
export const MONITOR_POLL_MS = 200;
/** Default streaming watch deadline (matches Claude Code's Monitor). */
export const MONITOR_DEFAULT_TIMEOUT_MS = 300_000;
/** Hard ceiling on a monitor's deadline. */
export const MONITOR_MAX_TIMEOUT_MS = 3_600_000;
/** Sliding window for firehose detection. */
export const MONITOR_RATE_WINDOW_MS = 10_000;
/** Max emitted lines per window before a monitor is auto-stopped. */
export const MONITOR_MAX_LINES_PER_WINDOW = 500;

export const PREVIEW_CHARS = {
    sidebar: 25,
    taskList: 40,
    detail: 50,
    line: 80,
    /** Live progress line shown in the sidebar pill. */
    progress: 60,
} as const;

// --- Domain types ---
/** Claude Code's task-status enum. "pending" exists for parity (a task that is
 *  registered but not yet started); every spawn path here starts "running". */
export type JobStatus = "pending" | "running" | "completed" | "failed" | "killed";

/** True once the job has reached a terminal state (completed | failed | killed). */
export function isTerminalStatus(status: JobStatus): boolean {
    return status === "completed" || status === "failed" || status === "killed";
}

/** What kind of background job this is. "shell" is the default (bash/bash_bg);
 *  "agent" is a background pi -p process (agent_bg); "monitor" is a
 *  streaming-event watch (the monitor tool). */
export type JobKind = "shell" | "agent" | "monitor";

/** Claude Code's typed task-id prefixes — one letter per kind, followed by 8
 *  random base36 chars (e.g. `b7f3k9a2x1`). See registry.newJobId. */
export const JOB_ID_PREFIX: Record<JobKind, string> = {
    shell: "b",
    monitor: "m",
    agent: "a",
};

export interface Job {
    id: string;
    name?: string;
    command: string;
    pid: number;
    startTime: number;
    status: JobStatus;
    exitCode?: number;
    logPath: string;
    proc?: ChildProcess;
    toolCallId: string;
    donePromise?: Promise<void>;
    resolveDone?: () => void;
    /** Exactly-once latch for the terminal <task-notification> (Claude Code's
     *  `notified` flag). Set BEFORE the notification send, before a deliberate
     *  kill, and when the agent reads the outcome via jobs output/attach — any
     *  path that already surfaced the result suppresses the notification. */
    notified?: boolean;
    isBackgrounded: boolean;
    /** Defaults to "shell" when absent. */
    kind?: JobKind;
    /** Transient teardown hook (follower + ws socket). */
    stop?: () => void;
}

export type BackgroundReason = "manual" | "timeout";

/** Transient handle for an in-flight foreground bash command, keyed by
 *  toolCallId in the registry. Ctrl+Shift+B and the timeout timer call
 *  requestPause to flip the command into the background. */
export interface ForegroundSlot {
    requestPause: (reason: BackgroundReason) => void;
}

// --- Event types ---
export const EVENT = {
    stall: "bg-stall",
    taskNotification: "task-notification",
    monitorEvent: "bg-monitor-event",
} as const;

export type EventName = (typeof EVENT)[keyof typeof EVENT];

// --- Deliver options ---
/** Steer the message into the current/next turn AND wake the agent.
 *  pi queues it while the agent is streaming and delivers it at the next
 *  tool-call boundary — Claude Code's 'next' priority. Use when the message
 *  IS something the agent must react to now: a background job's terminal
 *  <task-notification>, a stall warning, a deadline decision. */
export const DELIVER_STEER = { deliverAs: "steer", triggerTurn: true } as const;
/** Queue the message behind the current turn as a PASSIVE follow-up. The agent
 *  picks it up on its next natural turn (when the user re-engages or the
 *  current turn ends) but it does NOT spawn a new turn on its own. Monitor
 *  stream events are informational and never force an unsolicited
 *  acknowledgment or starve user input.
 *  NOTE: sendMessage-only — `pi.sendUserMessage` rejects `triggerTurn` and
 *  takes just `{ deliverAs: "followUp" }`. */
export const DELIVER_FOLLOWUP = { deliverAs: "followUp", triggerTurn: false } as const;

// --- UI context ---
export interface UiContext {
    ui: {
        notify(message: string, level?: "info" | "warning" | "error"): void;
        setWidget(
            name: string,
            content: string[] | undefined,
            options?: { placement?: "aboveEditor" | "belowEditor" }
        ): void;
        setStatus(name: string, content: unknown): void;
        theme: { fg(colour: string, text: string): string };
        select(title: string, options: string[]): Promise<string | undefined>;
        editor(title: string, content: string): Promise<string | undefined>;
    };
}

export type ToolResult = AgentToolResult<unknown>;
