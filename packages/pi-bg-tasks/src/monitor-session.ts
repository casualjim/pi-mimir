/**
 * The monitor session lifecycle — the tricky part of the monitor tool, lifted
 * out of the tool action so its invariants are unit-testable through a fake
 * MonitorSource (no real spawning, no real sockets).
 *
 * Responsibilities: stream each batch of new log lines as a notification,
 * rate-limit a firehose, emit exactly one terminal event (on natural exit,
 * kill, timeout, or firehose), and tear the source down. The tool just
 * validates, builds a source, and hands it here.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { BackgroundRegistry } from "./state.ts";
import {
 DELIVER_FOLLOWUP,
 EVENT,
 MONITOR_MAX_LINES_PER_WINDOW,
 MONITOR_RATE_WINDOW_MS,
 type Job,
 type UiContext,
} from "./types.ts";
import { renderSidebar } from "./registry.ts";
import { startBackgroundJob, terminateJobSilently } from "./lifecycle.ts";
import { followLines, type MonitorFollower } from "./monitor-follow.ts";
import type { MonitorSource } from "./monitor-source.ts";
import { completionSummary, sendTaskNotification, type TerminalStatus } from "./notify.ts";
import { redactShellOutput } from "./heimdall.ts";

/**
 * Wire a monitor's source to its event stream, terminal event, deadline, and
 * teardown. The job must already be in the registry. Returns nothing — the
 * session runs until the source ends, the deadline fires, or it is killed.
 */
export function startMonitorSession(args: {
 pi: ExtensionAPI;
 reg: BackgroundRegistry;
 ctx: UiContext;
 job: Job;
 source: MonitorSource;
 description: string;
 persistent: boolean;
 timeoutMs: number;
}): void {
 const { pi, reg, ctx, job, source, description, persistent, timeoutMs } = args;
 const { id, logPath } = job;

 let terminalEmitted = false;
 let finishing = false;
 let windowStart = Date.now();
 let windowLines = 0;

 // Stream events stay live but passive (delivered as a follow-up, no wake) —
 // they carry data the agent is actively watching and surface on the agent's
 // next natural turn without spawning an unsolicited one. The terminal
 // notice (stream ended / stopped / failed) is its own <task-notification>
 // (see finishMonitor), sent the moment the source ends.
 const emitEvent = (lines: string[]): void => {
  if (lines.length === 0) return;
  pi.sendMessage(
   {
    customType: EVENT.monitorEvent,
    content: `◉ ${description}\n${redactShellOutput(lines.join("\n"))}`,
    display: true,
    details: { jobId: id, description, logPath, terminal: false },
   },
   DELIVER_FOLLOWUP
  );
 };

 const follower: MonitorFollower = followLines(logPath, (lines) => {
  if (terminalEmitted) return;

  // Sliding-window firehose check.
  const now = Date.now();
  if (now - windowStart > MONITOR_RATE_WINDOW_MS) {
   windowStart = now;
   windowLines = 0;
  }
  windowLines += lines.length;

  emitEvent(lines);

  // Don't trip the firehose guard while draining the final flush.
  if (!finishing && windowLines > MONITOR_MAX_LINES_PER_WINDOW) {
   stopMonitor(
    "killed",
    `Monitor "${description}" stopped (too many events (>${MONITOR_MAX_LINES_PER_WINDOW}/${MONITOR_RATE_WINDOW_MS / 1000}s) — restart with a tighter filter)`
   );
  }
 });

 // job.stop: transient teardown invoked by the kill path. Tears down the
 // source (closes the ws socket) — the follower is stopped *and flushed* by
 // finishMonitor on the exit path (kill → process/socket close → exit →
 // onExit), so a user-initiated kill stays lossless.
 job.stop = source.stop;

 /**
  * Emit exactly one terminal <task-notification> for the monitor. Sent
  * before the job is marked terminal (onExit runs ahead of completeJob), so
  * the status/summary are explicit and eviction is left to completeJob.
  */
 const finishMonitor = (status: TerminalStatus, summary: string): void => {
  if (terminalEmitted) return;
  // Flush remaining lines first (while terminalEmitted is still false so
  // the follower callback emits them), then the terminal notification.
  finishing = true;
  follower.stop(true);
  terminalEmitted = true;
  sendTaskNotification({ reg, pi, job, status, summary, evict: false });
 };

 /** Forced stop (timeout / firehose). Emits a terminal event, then routes
  *  through the standard silent-kill path (which calls job.stop). */
 function stopMonitor(status: TerminalStatus, summary: string): void {
  finishMonitor(status, summary);
  terminateJobSilently(reg, job);
  renderSidebar(reg, ctx);
 }

 // Wire exit → terminal event. shouldNotify:false because the monitor owns
 // its own terminal event (no double-fire from completeJob). Monitors stream their
 // own output, so the prompt-stall heuristic is nonsensical here; the oversize
 // cap is also suppressed for persistent watches (session-length log tails are
 // expected to grow).
 const jobAc = startBackgroundJob({
  reg,
  pi,
  ctx,
  job,
  exit: source.exit,
  shouldNotify: false,
  disablePromptStall: true,
  disableOversizeKill: persistent,
  onExit: ({ code, signal }) => {
   // A signal death (external kill) is the "stopped" summary, never
   // "stream ended". Natural exits reuse completionSummary — the job
   // carries name: description, so the summary names the watch.
   if (job.status === "killed" || signal !== null) {
    finishMonitor("killed", completionSummary(job, "killed"));
   } else if (code === 0) {
    finishMonitor("completed", completionSummary(job, "completed"));
   } else {
    // completeJob marks terminal after onExit — set the exit code
    // now so completionSummary can name it.
    job.exitCode = code ?? undefined;
    finishMonitor("failed", completionSummary(job, "failed"));
   }
  },
 });

 // Deadline (skipped for persistent watches). Cleared when the job aborts
 // (natural exit or kill) so a short monitor doesn't keep a live timer +
 // closure alive for the whole timeout window.
 if (!persistent) {
  const deadline = setTimeout(() => {
   stopMonitor(
    "killed",
    `Monitor "${description}" stopped (timeout after ${Math.round(timeoutMs / 1000)}s)`
   );
  }, timeoutMs);
  (deadline as NodeJS.Timeout).unref();
  jobAc.signal.addEventListener("abort", () => clearTimeout(deadline), { once: true });
 }
}
