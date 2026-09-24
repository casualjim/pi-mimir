/**
 * The job registry — the single point of truth for every running or
 * recently-terminal background job. All CRUD operations live here.
 *
 * On top of the data store, this module renders the in-session sidebar
 * pill bar (`renderSidebar`) and aggregates stats (`getStats`).
 */

import { randomInt } from "node:crypto";
import { statSync, unlinkSync } from "node:fs";
import { formatDuration, jobLabel } from "./format.ts";
import {
 isTerminalStatus,
 JOB_ID_PREFIX,
 MAX_CONCURRENT_JOBS,
 PREVIEW_CHARS,
 RECENT_TERMINAL_KEEP,
 type Job,
 type JobKind,
 type UiContext,
} from "./types.ts";
import type { BackgroundRegistry } from "./state.ts";
import { redactShellOutput } from "./heimdall.ts";
import { readBoundedTail, readLastLine } from "./output.ts";

// --- ID generation -------------------------------------------------------

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Claude Code's typed task ids: a one-letter kind prefix (b/m/a) plus 8 random
 * base36 chars from crypto.randomInt (uniform — no modulo bias) — e.g.
 * `b7f3k9a2x1`. Random (not sequential) so an id is unguessable and
 * collision-improbable across sessions; when the live registry is passed, a
 * collision simply regenerates.
 */
export function newJobId(kind: JobKind, reg?: BackgroundRegistry): string {
 let id: string;
 do {
  let suffix = "";
  for (let i = 0; i < 8; i++) {
   suffix += ID_ALPHABET[randomInt(0, ID_ALPHABET.length)];
  }
  id = `${JOB_ID_PREFIX[kind]}${suffix}`;
 } while (reg?.jobs.has(id));
 return id;
}

/** Dedicated log directory. Keeping logs in their own dir (not loose in /tmp)
 *  keeps the stale-log sweep bounded — it lists only our files. */
export const LOG_DIR = "/tmp/pi-bg";

export function logPathFor(jobId: string): string {
 return `${LOG_DIR}/${jobId}.log`;
}

/** Sibling stderr-capture path for a monitor's split output. Keeps the
 *  `.log`/`.err` naming convention in one place. */
export function errPathFor(jobId: string): string {
 return `${LOG_DIR}/${jobId}.err`;
}

/**
 * Build a fresh running Job. Centralizes the Job shape so the new `kind`/`stop`
 * fields (and any future additions) don't drift across the bash/bash_bg/
 * agent_bg/monitor construction sites.
 */
export function createRunningJob(args: {
 id: string;
 command: string;
 pid: number;
 logPath: string;
 toolCallId: string;
 name?: string;
 kind?: JobKind;
 isBackgrounded?: boolean;
}): Job {
 return {
  id: args.id,
  name: args.name,
  command: args.command,
  pid: args.pid,
  startTime: Date.now(),
  status: "running",
  logPath: args.logPath,
  toolCallId: args.toolCallId,
  isBackgrounded: args.isBackgrounded ?? true,
  kind: args.kind,
 };
}

// --- Registry mutations --------------------------------------------------

/** Record that a job has started (lifetime counter). */
export function markStarted(reg: BackgroundRegistry): void {
 reg.totalStarted++;
}

/** Add a brand-new running job and count it as started. */
export function add(reg: BackgroundRegistry, job: Job): Job {
 reg.jobs.set(job.id, job);
 markStarted(reg);
 return job;
}

/** True once the running-job count has reached the concurrency cap. Counts with
 *  a short-circuit so it stops at the cap instead of scanning the whole map. */
export function atConcurrencyLimit(reg: BackgroundRegistry): boolean {
 let n = 0;
 for (const job of reg.jobs.values()) {
  if (job.status === "running" && ++n >= MAX_CONCURRENT_JOBS) return true;
 }
 return false;
}

/**
 * Remove a terminal job from the live map and update lifetime counters.
 * Returns the removed job (or undefined if it wasn't in the map).
 */
export function forget(reg: BackgroundRegistry, job: Job): Job | undefined {
 if (!reg.jobs.delete(job.id)) return undefined;
 if (job.status === "completed") {
  reg.completedCount++;
  reg.totalDurationMs += terminalDurationMs(job);
 } else if (job.status === "failed") {
  reg.failedCount++;
  reg.totalDurationMs += terminalDurationMs(job);
 } else if (job.status === "killed") {
  reg.killedCount++;
 }
 reg.recentTerminal.push(job);
 if (reg.recentTerminal.length > RECENT_TERMINAL_KEEP) {
  reg.recentTerminal.shift();
 }
 return job;
}

/** Look up a job by ID — first the live registry, then the recent-terminal ring
 *  for jobs that already finished and were evicted. */
export function findJob(reg: BackgroundRegistry, jobId: string): Job | undefined {
 return (
  reg.jobs.get(jobId) ??
  reg.recentTerminal.find((j) => j.id === jobId)
 );
}

/** Purge all terminal jobs from in-memory state and delete their log files. */
export function cleanupTerminal(reg: BackgroundRegistry): {
 purged: number;
 bytesReclaimed: number;
} {
 let purged = 0;
 let bytes = 0;
 const deletedLogs = new Set<string>();
 const deleteOnce = (logPath: string): number => {
  if (deletedLogs.has(logPath)) return 0;
  deletedLogs.add(logPath);
  return deleteLogFile(logPath);
 };

 const idsToRemove: string[] = [];
 for (const [id, job] of reg.jobs.entries()) {
  if (isTerminalStatus(job.status)) {
   idsToRemove.push(id);
   bytes += deleteOnce(job.logPath);
   purged++;
  }
 }
 for (const id of idsToRemove) {
  reg.jobs.delete(id);
 }
 // The recent-terminal ring is all terminal jobs too — sweep their logs.
 for (const job of reg.recentTerminal) {
  bytes += deleteOnce(job.logPath);
  purged++;
 }
 reg.recentTerminal.length = 0;
 return { purged, bytesReclaimed: bytes };
}

function deleteLogFile(logPath: string): number {
 try {
  const { size } = statSync(logPath);
  unlinkSync(logPath);
  return size;
 } catch {
  return 0;
 }
}

// ─── Sidebar rendering ───────────────────────────────────────────────────

/**
 * Render the pill-bar status widget and aggregate status-bar text, and keep a
 * 1 Hz ticker running while any job is alive so the durations stay live (the
 * widget isn't redrawn on a timer otherwise). Re-renders only when the content
 * actually changes. Call after any state change that affects running jobs.
 */
export function renderSidebar(reg: BackgroundRegistry, ctx: UiContext): void {
 const pills: string[] = [];
 let runningCount = 0;
 const runningLogs = new Set<string>();

 for (const job of reg.jobs.values()) {
  // Terminal jobs render no pill: their outcome is always surfaced by a
  // <task-notification>, a kill, or a read — there is no unread state.
  if (isTerminalStatus(job.status)) continue;
  runningCount++;
  runningLogs.add(job.logPath);
  const duration = formatDuration(Date.now() - job.startTime);
  const glyph = job.kind === "monitor" ? "◉" : "▶";
  // Show the job's latest output line as live progress; fall back to the
  // command until there's any output. Re-read each tick by the ticker.
  const progress = sidebarLastLine(job.logPath) || job.command;
  pills.push(
   `${glyph} ${jobLabel(job)}: ${progress.slice(0, PREVIEW_CHARS.progress)} (${duration})`
  );
 }

 // Drop progress-cache entries for logs no longer tracked.
 for (const key of sidebarLineCache.keys()) {
  if (!runningLogs.has(key)) sidebarLineCache.delete(key);
 }

 if (pills.length === 0) {
  stopSidebarTicker(reg);
  if (reg.lastSidebarContent !== undefined) {
   reg.lastSidebarContent = undefined;
   ctx.ui.setWidget("background-jobs", undefined);
   ctx.ui.setStatus("background-jobs", undefined);
  }
  return;
 }

 const parts = [`${runningCount} running`];
 if (reg.completedCount > 0) parts.push(`${reg.completedCount} done`);
 if (reg.failedCount > 0) parts.push(`${reg.failedCount} failed`);
 const statusText = `▶ ${parts.join(", ")}`;
 const key = `${pills.join("\n")}|${statusText}`;

 if (key !== reg.lastSidebarContent) {
  reg.lastSidebarContent = key;
  ctx.ui.setWidget("background-jobs", pills);
  ctx.ui.setStatus("background-jobs", ctx.ui.theme.fg("accent", statusText));
 }

 // The 1 Hz ticker exists to keep running-job durations live; with no
 // running jobs there is nothing to tick.
 if (runningCount > 0) ensureSidebarTicker(reg, ctx);
 else stopSidebarTicker(reg);
}

/** Per-log cache for the sidebar's live progress line: the 1 Hz ticker would
 *  otherwise re-read every running job's tail every tick even when output is
 *  static. statSync first; skip the read when the size is unchanged. */
const sidebarLineCache = new Map<string, { size: number; lastLine: string }>();

function sidebarLastLine(logPath: string): string {
 let size: number;
 try {
  size = statSync(logPath).size;
 } catch {
  sidebarLineCache.delete(logPath);
  return "";
 }
 const cached = sidebarLineCache.get(logPath);
 if (cached && cached.size === size) return cached.lastLine;
 const lastLine = readLastLine(logPath);
 sidebarLineCache.set(logPath, { size, lastLine });
 return lastLine;
}

/** Start the live-duration ticker if not already running. */
function ensureSidebarTicker(reg: BackgroundRegistry, ctx: UiContext): void {
 if (reg.sidebarTimer) return;
 const t = setInterval(() => {
  try {
   renderSidebar(reg, ctx);
  } catch {
   // The captured ctx went stale (session reload/fork/switch) — stop
   // ticking rather than throw an uncaught exception in the interval.
   stopSidebarTicker(reg);
  }
 }, 1000);
 t.unref();
 reg.sidebarTimer = t;
}

/** Stop the live-duration ticker (no running jobs, or on shutdown). */
export function stopSidebarTicker(reg: BackgroundRegistry): void {
 if (reg.sidebarTimer) {
  clearInterval(reg.sidebarTimer);
  reg.sidebarTimer = undefined;
 }
}

// ─── Stats ───────────────────────────────────────────────────────────────

export interface JobStats {
 totalStarted: number;
 running: number;
 completed: number;
 failed: number;
 killed: number;
 recentTerminal: number;
 averageDurationMs: number;
 totalDurationMs: number;
}

export function getStats(reg: BackgroundRegistry): JobStats {
 let running = 0;
 for (const job of reg.jobs.values()) {
  if (job.status === "running") running++;
 }
 const terminalCount = reg.completedCount + reg.failedCount;
 return {
  totalStarted: reg.totalStarted,
  running,
  completed: reg.completedCount,
  failed: reg.failedCount,
  killed: reg.killedCount,
  recentTerminal: reg.recentTerminal.length,
  averageDurationMs:
   terminalCount > 0
    ? Math.round(reg.totalDurationMs / terminalCount)
    : 0,
  totalDurationMs: reg.totalDurationMs,
 };
}

// ─── Internal helpers ──────────────────────────────────────────────────

function terminalDurationMs(job: Job): number {
 return Date.now() - job.startTime;
}

// ─── Status helpers (used by tools and shortcuts) ───────────────────────────────────────────

/** True when the job is currently in the running state. */
export function isRunning(job: Job): boolean {
 return job.status === "running";
}

/** Read only the tail of a job's log file — O(maxChars) even for large files. */
export function readLogTail(job: Job, maxChars: number): string {
 return redactShellOutput(readBoundedTail(job.logPath, maxChars));
}
