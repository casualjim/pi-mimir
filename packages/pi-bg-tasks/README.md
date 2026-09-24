# @casualjim/pi-bg-tasks

Heimdall-enabled fork of [pi-patty-bg-tasks](https://github.com/patty-io/pi-patty-bg-tasks)
by Patrick Rho (MIT) for the Pi agent. Same
Claude Code-parity background-task experience; every shell spawn the plugin
makes — `bash` foreground/background, `bash_bg`, `monitor` commands — runs
inside the [heimdall](https://github.com/casualjim/pi-mimir) sandbox with the
same policy the heimdall extension enforces, guarded by heimdall's command
preflight, with model-visible output redacted by the secret-guard.

## How it composes with heimdall

Pi treats the same tool name registered by two extensions as a **fatal load
conflict**, so `bash` ownership is exclusive and negotiated through two
global symbols:

- **This extension loads first:** it registers its sandbox-aware `bash` and
  claims ownership (`Symbol.for("pi-heimdall.companion-bash")`). heimdall
  sees the claim and skips its own bash registration. This is the
  recommended order — you get the full patty experience: auto-backgrounding
  bash, `run_in_background`, Ctrl+Shift+B.
- **heimdall loads first:** heimdall registers its bash and marks it
  (`Symbol.for("pi-heimdall.bash-registered")`). This extension then skips
  its bash override and registers only `bash_bg`, `jobs`, and `monitor` —
  all still spawning through the sandbox — and warns at session
  start. No crash either way.

In both orders heimdall's guards, `--no-sandbox` flag, `heimdall-allow`,
`!`-shell sandboxing, and `/sandbox` command stay active, and every shell
spawn this plugin makes runs through the heimdall sandbox when enabled.

- **Only this package installed:** full patty behavior with unsandboxed
  spawns (the heimdall package is an optional peer dependency).
- **Only heimdall installed:** nothing from this package — heimdall does not
  depend on it.
- **Under omp (Oh My Pi):** the entry is a no-op; omp ships native
  background jobs.

## Deliberate deviations from upstream

- `agent_bg` is removed: nested-agent delegation is owned by the herdr
  subagent tooling (`@casualjim/pi-herdr-agents`), which covers the same
  ground with panes, worktrees, and role/model pools.
- Sandbox spawns pipe output through the plugin into the log file (the
  sandbox supervisor owns the child), so the raw spawner's zero-JS data path
  applies only to unsandboxed spawns.
- The `--no-sandbox` flag is owned by the heimdall extension (Pi 0.87.1+
  hard-errors on duplicate flag registration); the fork reads it.

## Install

Requires `@casualjim/pi-heimdall` alongside (optional but the point of this
fork):

```
pi npm:@casualjim/pi-bg-tasks
pi npm:@casualjim/pi-heimdall
```

Sandbox behavior follows heimdall's own config (`~/.config/heimdall/`,
`.config/heimdall.json`, `--no-sandbox`).

---

Everything below this line is the upstream
[pi-patty-bg-tasks](https://github.com/patty-io/pi-patty-bg-tasks) README,
kept for the tool docs and release history. Credit for the design and the
Claude Code-parity engine belongs there; where this fork deviates, the
sections above win.


<p align="center">
  <strong>Long commands shouldn't freeze your agent. Background them automatically — and keep shipping.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pi-patty-bg-tasks"><img alt="npm" src="https://img.shields.io/npm/v/pi-patty-bg-tasks?color=cb3837&label=npm&logo=npm"></a>&nbsp;
  <img alt="Pi v0.37+" src="https://img.shields.io/badge/Pi-v0.37%2B-5b50f0">&nbsp;
  <img alt="dependencies: zero" src="https://img.shields.io/badge/dependencies-zero-3fb950">&nbsp;
  <img alt="tmux: not required" src="https://img.shields.io/badge/tmux-not_required-3fb950">&nbsp;
  <img alt="license: MIT" src="https://img.shields.io/badge/license-MIT-blue">
</p>

**Your agent shouldn't twiddle its thumbs while the build runs.** This is Claude Code's background-task experience, brought to Pi: kick off a long command, and instead of blocking the whole session, it slips into the background while the agent keeps working. Auto-background after 120 seconds, instant background with Ctrl+Shift+B, output capture, stall detection, and a full job manager — all in one extension.

## Install

```
pi install npm:pi-patty-bg-tasks
```

Or straight from GitHub:

```
pi install git:github.com/patty-io/pi-patty-bg-tasks
```

Needs Pi v0.37+. That's the only requirement — there are **no external dependencies** and **no tmux**. Background jobs run as plain Node.js child processes with their output piped straight to a file descriptor. Nothing to install, nothing to babysit.

## Why You'll Want This

**Blocked sessions are over.** Dev servers, test suites, builds — anything still chugging after 120 seconds gets quietly moved to the background. The agent gets a heads-up and carries on with the next thing instead of staring at a spinner. Want it gone sooner? Background any command by hand, any time.

**It feels like Claude Code, because it's modeled on Claude Code.** The whole background/foreground dance — Ctrl+Shift+B to background, output capture, completion pings, stall detection — is built directly on Claude Code's implementation. Same message format, same terminal-native icons, same "agent never stops moving" flow. If you've got the muscle memory, it's already here.

**A real job manager, not an afterthought.** `/bg-list` opens an interactive task manager where you can list jobs, peek at their output, kill the runaways, or attach and wait for a result.

## Quick Start

```
# Agent runs a long command — auto-backgrounds after 120s
bash({ command: "npm run build" })

# Skip the wait — start it in the background up front
bash({ command: "npm run dev", run_in_background: true })

# Or fire-and-forget straight to the background
bash_bg({ command: "npm run dev", name: "devserver" })

# Check on what's running
jobs({ action: "list" })

# Grep across every job's output at once
jobs({ action: "search", pattern: "error|warning" })

# Hand off a whole task to a background agent
agent_bg({ prompt: "Refactor the auth module" })
```

Hit **Ctrl+Shift+B** whenever commands are running to background them all on the spot — a dim `(ctrl+shift+b to run in background)` hint appears under your input once a command has been going a couple of seconds. The agent gets notified and is back to work before you've let go of the keys.

## Tools

### bash (override)

The built-in bash tool, with a survival instinct. Commands run normally — but if one blows past 120 seconds, it silently slides into the background. No decision prompt, no forced turn: the tool result itself (`Command running in background with ID: …`) tells the agent where the output is going.

| Parameter | Description |
|-----------|-------------|
| `command` | Shell command to run |
| `timeout` | Custom timeout in seconds (default: 120) |
| `run_in_background` | Start the command in the background immediately, skipping the foreground run and the auto-background timer |

### bash_bg

When you already know it's a long one. Starts a command in the background immediately — no foreground race, no timeout to wait out.

| Parameter | Description |
|-----------|-------------|
| `command` | Shell command to run |
| `name` | Optional human-readable label for the job |
| `timeout` | Optional timeout in seconds; an overrun kills only commands that can't be auto-backgrounded (e.g. `sleep`) — anything else keeps running |
| `notify` | Send a completion notification (default: true) |

### jobs

Mission control for everything running in the background: list, read output, kill, attach, search, cleanup, or pull stats.

| Action | Description |
|--------|-------------|
| `list` | Show all running and recently completed jobs |
| `output` | Read the log tail of a specific job |
| `kill` | Terminate a running job |
| `attach` | Wait for a job to finish, then return its output |
| `search` | Regex search across all job logs |
| `cleanup` | Purge completed/failed jobs and reclaim disk |
| `stats` | Aggregate metrics: total started, running, completed, failed, average duration |

### agent_bg

Clone yourself a coworker. Spawns a detached `pi -p` process with a continuity prompt derived from the current session, then streams its progress back to you live.

| Parameter | Description |
|-----------|-------------|
| `prompt` | Task description for the background agent |
| `cwd` | Working directory (default: current) |

### monitor

Stream events instead of waiting once. Where `bash_bg`/`run_in_background` give a **single** completion ping, `monitor` turns a process into a **live event stream** — each stdout line (or WebSocket frame) becomes one notification delivered straight into the agent's turn while it keeps working. This is the streaming half of Claude Code's split: one-shot "wait until done" stays on `run_in_background`; per-event "tell me each time X happens" is `monitor`.

```js
// Notify on every error line, indefinitely
monitor({ command: "tail -f deploy.log | grep --line-buffered -E 'ERROR|Traceback'", description: "errors in deploy.log" })

// Emit each CI check as it lands, stop when the run finishes
monitor({ command: "…poll loop that exits…", description: "CI checks for PR 123" })

// Subscribe to a WebSocket feed — each text frame is an event
monitor({ ws: { url: "wss://events.example.com/stream" }, description: "deploy events", persistent: true })
```

| Parameter | Description |
|-----------|-------------|
| `command` | Shell script; each stdout line is an event. Mutually exclusive with `ws`. |
| `ws` | WebSocket source `{ url, protocols? }`; each text frame is an event. Mutually exclusive with `command`. |
| `description` | Shown on every notification (make it specific). **Required.** |
| `persistent` | Run for the whole session (no timeout); stop with `jobs action='kill'`. Default `false`. |
| `timeout_ms` | Deadline before the watch is killed (default `300000`, max `3600000`). Ignored when `persistent`. |

Monitors share the same job registry, sidebar (shown with a `◉` pill), and `jobs` manager as the background tools — only stdout is the event stream (stderr is captured to a separate `.err` file), output is line-buffered so use `grep --line-buffered`/`awk fflush()` (never `head`), and a monitor that floods events is auto-stopped so you can restart with a tighter filter. The `ws` source needs a runtime with a global `WebSocket` (Node 22+); otherwise use a `command` like `websocat`.

> **Persistent monitors and disk:** a non-`persistent` monitor's output log is capped (oversized output kills it), but a `persistent` monitor is expected to run for the whole session, so its log is **not** size-capped — point a long-lived `tail -f` at a filtered stream rather than a firehose, and stop it with `jobs action='kill'` when done.

## Keyboard Shortcuts

Keep your hands on the keyboard.

| Shortcut | Action |
|----------|--------|
| **Ctrl+Shift+B** | Background all running foreground commands — agent keeps working (Claude Code's Ctrl+B; pi reserves Ctrl+B itself for editor cursor-left). Inside tmux without extended-keys, use `/bg` instead. |
| **Ctrl+Shift+J** | Open the background task manager |
| **Shift+Down** | Open the background task manager |
| **Ctrl+Shift+X** | Kill the most recent running job |

## Commands

Prefer slashes? Same powers, different door.

| Command | Description |
|---------|-------------|
| `/bg` | Background the current process (same as Ctrl+Shift+B) |
| `/bg-list` | Open the interactive background task manager |
| `/bg-version` | Show the loaded extension version/path for reload diagnostics |

## How It Works

No magic, just a tidy state machine:

```
Command starts (direct Node.js child_process.spawn)
  → Done in <2s?           Return the result immediately
  → Still running at 120s? Auto-background → the tool result carries the new task ID
  → You press Ctrl+Shift+B?  Background immediately → agent continues

Background job running
  → Output captured to /tmp/pi-bg/<id>.log via file descriptor
  → Stall detection: if the output goes quiet and the tail looks like an interactive prompt, the agent is warned
  → Oversize detection: if the output blows past the limit, the job is killed
  → On completion: an individual <task-notification> lands mid-turn with status + output path
```

Background jobs run as detached Node.js child processes with their stdout/stderr wired
straight to a log file descriptor — the exact pattern Claude Code uses. No tmux, no
external process manager, nothing standing between your command and its log. Up to
**16 background jobs** run at once; ask for a 17th and it's politely rejected until a
slot frees up. The registry is purely in-memory: a session shutdown — any shutdown,
not just quit — kills every running task, and nothing is revived into the next
session. Log files in `/tmp/pi-bg` are simply left for the OS to clean.

Under the hood, all three task kinds (shell, agent, monitor) live in one unified
in-memory registry and share a single notification engine. Spawning listens for the
child's `exit` event rather than `close`, so a daemonized grandchild that inherits
the output descriptors can't hang a job past its real end. Each finished task sends
its own `<task-notification>` exactly once — reading a finished job's output with
`jobs output`/`attach` marks it read and suppresses the pending ping, and
completed-but-unread jobs show `, unread` in `jobs list` and the sidebar.

## Cooperative Steering (Claude Code parity)

Type a message while a backgroundable foreground command is running, and the extension steps in **before** Pi queues your text as steering:

1. The active foreground command slides into the background (output keeps capturing — nothing is lost).
2. The current agent turn is aborted.
3. Your message is re-injected as a fresh user turn the instant the agent is idle.

That's exactly how Claude Code behaves: submitting input during an interruptible tool aborts the tool and starts a new turn, instead of leaving your message stuck in line behind a long-running call. No polling, no waiting your turn.

**Scope:** this applies to the `bash` tool this extension owns. Long-running tools the extension doesn't wrap fall back to Pi's native steering (queued, delivered at the next turn boundary).

## Status Bar

A live pill widget keeps your running jobs in view — each with its duration and a preview of the command. Completed and failed counts ride along in the status line. When you want the full picture, Shift+Down or `/bg-list` opens the task manager.

## Releases

### 2.0.0 — Claude Code parity re-architecture

The background engine was rebuilt end to end to match Claude Code's actual implementation.

**Breaking changes**
- **`job_decide` is gone.** On the auto-background timeout the command silently slides into the background — the tool result itself (`Command running in background with ID: …`) is the notification. No decision prompt, no forced turn.
- **Task IDs changed format.** Sequential `job-<pid>-<n>` is replaced by typed random IDs: `b…` (shell), `m…` (monitor), `a…` (agent) plus 8 base36 chars (e.g. `b7f3k9a2x1`).
- **No cross-session revival.** Background tasks don't survive a session restart/reload — any session shutdown kills all running tasks. The registry is purely in-memory; `/tmp/pi-bg/*.log` files are left for the OS to clean (the 24h stale-log sweep is gone too).
- **Completion notifications are individual `<task-notification>` messages** delivered mid-turn (pi's steer mode) — the agent reacts between tool calls. The turn-boundary coalesced summary and the idle coalescing window are gone.

**Engine**
- Exactly-once delivery via a `notified` latch (CC's `markTaskNotified`): reading a finished job with `jobs output`/`attach` suppresses its pending notification; completed-but-unread jobs show `, unread` in `jobs list` and the sidebar; notified terminal jobs leave the live list (recent ones stay in a recent-terminal ring).
- One unified in-memory registry for shell/monitor/agent kinds (`jobs list` lines carry a `[shell|agent|monitor]` tag), a single notification engine (`src/notify.ts`), and spawn now uses the `exit` event so daemonized grandchildren can't hang a job.
- Ctrl+Shift+B (and `/bg`) now background ALL running foreground commands, not just the most recent one.
- CC-exact user-facing strings throughout (manual background, `jobs kill`, unknown-id errors, completion summaries, stall warnings); timeout kills log `Command timed out after Ns` so the model can tell a timeout kill from a failure.

### 1.1.6 — Silent timeout backgrounding (CC parity)

The 1.1.5 fix stopped the *completion* notice from forcing an acknowledgment, but the **timeout** itself was still interrupting: a `[bg-timeout]` message woke the agent and demanded a `job_decide (keep / kill / check)`, so the agent would call `job_decide`, then say *"Already killed"* — chatter around something that needs no decision. Verified against Claude Code's source: on timeout CC just silently slides the command into the background (`backgroundFn(shellId)`) — no message, no decision request, no forced turn. The bash tool's own *"Process backgrounded"* result is the agent's notification.

- **No more `[bg-timeout]` steering message.** `requestJobDecision` no longer calls `sendMessage` at all. The auto-backgrounded command's status reaches the agent through the bash tool result (now annotated *"auto-backgrounded after Ns; still running — check with jobs output if needed"*), exactly like CC.
- **Passive toast only.** The human still gets a subtle *"Backgrounded X after Ns; still running"* toast so it's visible, but the agent's turn is never interrupted.
- **`job_decide` remains available** if the agent or user explicitly wants to keep/kill/check — it's just no longer forced.
- Removed the now-unused `DELIVER_FOLLOWUP_WAKE` deliver constant (no path wakes on a system message anymore except the idle-path completion flush, which uses `DELIVER_STEER`).

### 1.1.5 — No more redundant acknowledgments (CC `notified` parity)

A completion notice would fire even after the agent had already learned the job's outcome (via `jobs output`, `job_decide`, or `jobs attach`), and then *instruct* the agent to call `jobs output` — so the agent dutifully acknowledged every finished job, even ones it already handled. Fixed by matching Claude Code's notification philosophy exactly:

- **Outcome-known suppression (`notified`-flag parity).** Any path that lets the agent learn a job's result — `jobs output`, `job_decide` (every decision), `jobs attach` — now sets the `outputConsumed` flag, so the pending completion notice is suppressed instead of re-telling the agent what it already knows. This is Claude Code's `markTaskNotified`.
- **Completed jobs are bare.** A `completed` job's notice is now a plain status line (`✓ "npm test" (5s, job-1-1)`) with **no `→ jobs output` nudge**. Only `failed` jobs carry the nudge — they're the ones that need attention. Matches Claude Code's `"Background command X completed"` summary, which is informational, never imperative.
- **Turn-boundary notices are passive.** The turn-boundary flush no longer wakes the agent (`triggerTurn: false`) — it queues behind the current turn and is picked up on the next natural one. This is Claude Code's `priority: 'later'`: system messages never starve user input and never spawn an unsolicited follow-up turn. (The idle-path flush still steers, since the user isn't engaged; the timed-out-job `job_decide` request still wakes.)

### 1.1.2 — One summary, not a wall of notices

- **Background notices coalesce at the turn boundary.** Jobs and monitors that finish during a long agent turn no longer dump a wall of `[job-finished]` / `[bg-monitor-event]` lines after the agent's reply. They accumulate and flush as **one summary** when the turn ends (`agent_end`) — *"4 background events — 1 completed (job-19), 1 failed (job-30 exit 1); 2 monitors ended (API health, port 4000)."* While the agent is idle, a short fallback window coalesces instead. Monitor *stream* events (the matched lines you're watching) stay live.
- A guard drains any notices stranded by a turn that ended abnormally, so nothing gets stuck undelivered.

### 1.1.1 — Parity fixes, no-data-loss, live progress

- **Live progress in the sidebar.** A running job's pill now shows its **latest output line** (refreshed every second), not just the command — so a long poll/build shows progress at a glance (`◉ qdrant: {"indexed":8540629,"status":"grey"} (2m10s)`). ANSI/control sequences are stripped so the widget stays clean and can't be escape-injected.
- **No more lingering `sleep` jobs.** A naive `sleep N` wait (even embedded — `cd x; sleep 600; check`, newline-separated, or backgrounded) is now blocked in both `bash` and `bash_bg`, with steering to the tool that ends when the work does: `jobs attach`, the `monitor` tool, or an `until` loop. Sleeps inside real polling loops are never flagged.
- **Claude Code parity on cancel (verified against CC source).** Pressing **Esc** kills the running foreground command (a deliberate cancel), while typing a new message, **Ctrl+Shift+B**, or the auto-background timeout move it to the background instead — exactly CC's `user-cancel` vs `interrupt` behavior. Long work is protected by auto-backgrounding at the timeout + `run_in_background`, not by ignoring a cancel.

### 1.1.7 — Ctrl+Shift+B (pi reserved-keybinding fix)

- **Background shortcut moved from Ctrl+B to Ctrl+Shift+B.** Recent pi versions reserve `ctrl+b` for the built-in editor cursor-left (`tui.editor.cursorLeft`) and print a startup "extension shortcut conflict" diagnostic when an extension claims it. Registering it also silently broke cursor-left in pi's editor. Everything else is unchanged: the live hint now reads `(ctrl+shift+b to run in background)`, and `/bg` still works everywhere (use it in tmux without extended-keys).

### 1.1.0 — Monitor tool & coalesced completions

- **New `monitor` tool** — the streaming half of Claude Code's split: each stdout line (or WebSocket frame) becomes one notification as it happens. Use it for per-event streams (`tail -f | grep`, poll loops, file watches, ws feeds), while `run_in_background` keeps the one-shot "wait until done" case. Supports `command`/`ws` sources, `persistent` watches, a `timeout_ms` deadline, line-accurate following, and auto-stop on a firehose. Shows with a `◉` pill in the sidebar and `jobs` manager.
- **No more wall of `[job-finished]` lines** — a burst of finishing background jobs now coalesces into a single summary notice instead of one stale line per job dumped after your next message.
- Internals: `MonitorSession` extracted behind a `MonitorSource` seam (command + ws adapters), making the streaming/terminal lifecycle unit-testable. Zero new dependencies (ws uses the runtime's global `WebSocket`, Node 22+).

### 1.0.2 — Ctrl+B parity & friendlier jobs

- **Ctrl+B** is now the primary background shortcut (Ctrl+Shift+B stays as an alias), with a live `(ctrl+b to run in background)` hint under the editor while a command runs — matching Claude Code. Inside tmux it shows the "(twice)" note.
- **`jobs attach` streams the job's live output** while it waits (it was silent before) and is reworded "Following … live output"; detaching leaves the job running.
- **Sidebar pills tick live** — durations update every second instead of freezing at the value they were last drawn with.
- Job-finished and timeout notices are **compact** (a one-line agent follow-up + a UI toast) — the agent stays informed without boxed spam.

### 1.0.1 — Claude Code parity (first published 1.x)

The big one. The background engine was rewritten from the ground up to match Claude Code's architecture, with zero external dependencies. This is the first 1.x on npm, and it ships the parity rewrite alongside a solid round of correctness and performance hardening.

**Breaking changes**
- **tmux is gone.** Background jobs now run as direct Node.js `child_process.spawn` processes with file-descriptor output capture. tmux is no longer used or required — nothing left to install.
- **Default auto-background timeout is now 120s** (was 15s), matching Claude Code. Pass an explicit `timeout` to override.
- Background logs moved from `/tmp/pi-bg-<id>.log` to a dedicated `/tmp/pi-bg/<id>.log` directory.

**Highlights**
- New `run_in_background: true` parameter on the `bash` tool.
- `agent_bg` now streams progress live and resolves the `pi` binary path (so it works even outside standard `$PATH` installs).
- Cooperative steering delivers your message as a follow-up turn — no polling loop.
- Concurrency cap of 16 simultaneous background jobs.
- Code and UI are English-only.

**Fixes & internals (post-rewrite hardening)**
- Cooperative steering no longer kills the very command it just backgrounded.
- Spawn failures (`ENOENT`/`EMFILE`/`EAGAIN`) are handled gracefully instead of crashing the agent.
- The four spawn paths were consolidated onto a single `startBackgroundJob` service function; foreground teardown moved into `finally` so no exit path can strand a job.
- Log search runs concurrently across jobs, and the stale-log sweep is bounded and async.

### 0.3.1 and earlier

tmux-backed background jobs, 15s auto-background, cooperative steering, and the interactive job manager.

## Development

```
git clone https://github.com/patty-io/pi-patty-bg-tasks.git
cd pi-patty-bg-tasks
pnpm install
pnpm check    # type-check
pnpm test     # run tests
```

Requires Node.js ≥ 22, pnpm ≥ 10. No tmux or other external dependencies — what you clone is what you run.

## Contributing

PRs welcome. The drill:

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make sure `pnpm check` and `pnpm test` pass
4. Commit with [conventional commits](https://www.conventionalcommits.org/)
5. Open a PR against `main`

## License

[MIT](LICENSE) © Patty

## Author

**Patty** · [GitHub](https://github.com/patty-io)
