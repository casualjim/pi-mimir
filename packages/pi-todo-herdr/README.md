# pi-todo-herdr

Hierarchical, session-local task tracking for [Pi](https://pi.dev), with atomic batch tools, a live task-tree widget, and optional [Herdr](https://herdr.dev) sidebar integration.

![pi-todo-herdr task tree and Herdr sidebar](https://github.com/leset0ng/pi-todo-herdr/raw/main/media/screenshot.png)

## Features

- Five focused tools: `set_tasks`, `update_task`, `rm_task`, `list_task`, and `get_task`
- Parent/child task trees with generated integer IDs and atomic append/replace modes
- Atomic batch mutations: every requested change succeeds or none of it is applied
- Four states: `pending`, `in-progress`, `blocked`, and `done`
- Cumulative active-time tracking that pauses outside `in-progress` and survives session restore
- Session-branch persistence across reload, resume, fork, tree navigation, and context compaction
- A concise first-action workflow prompt plus a one-shot post-compaction recovery reminder
- Compact Pi widget with hierarchy, status colors, and an adaptive progress bar
- Optional Herdr metadata showing the current task in the agent sidebar

## Requirements

- Pi 0.81 or newer
- Node.js 20 or newer
- Herdr is optional; all task tools and the Pi widget work without it

## Install

Install the latest version from npm:

```bash
pi install npm:pi-todo-herdr
```

Then start Pi. If Pi is already running, use `/reload` to load the extension.

To try the package for one run without installing it:

```bash
pi -e npm:pi-todo-herdr
```

Update or remove it with Pi's package commands:

```bash
pi update npm:pi-todo-herdr
pi remove npm:pi-todo-herdr
```

## Usage

For work with three or more distinct steps, the extension instructs Pi to explore enough to understand the scope, then call `set_tasks` before implementation. Smaller work remains untracked. Pi then updates task states at each real transition instead of reconstructing progress at the end.

After automatic or manual context compaction, the extension sends one short hidden reminder only when unfinished tasks exist. Pi calls `list_task` to recover the authoritative current IDs and statuses; the full tree is not injected on every model call.

| Tool | Parameters | Behavior |
| --- | --- | --- |
| `set_tasks` | `{ mode, tasks, force }` | `append` extends the tree with `force: false`; `replace` atomically installs a new tree or clears it with `[]`. Replacing unfinished work requires `force: true`. |
| `update_task` | `{ tasks: [...] }` | Atomically patches multiple tasks. Use `null` for unchanged text/status, `parentId: -1` for unchanged or `0` to move to root, and `position: -1` to keep the current order. |
| `rm_task` | `{ ids: [...], reason }` | Removes only mistaken, duplicate, or canceled tasks. Removing a parent cascades through its descendants. |
| `list_task` | `{}` | Returns the full tree as compact `id/status/name` lines. |
| `get_task` | `{ ids: [...] }` | Returns complete task details, including parent/child IDs and timing for tasks that have started. |

Example append call:

```json
{
  "mode": "append",
  "tasks": [
    {
      "name": "Implement authentication",
      "description": "Add session validation and route protection.",
      "status": "in-progress",
      "parentId": null,
      "children": [
        {
          "name": "Add auth middleware",
          "description": "Validate the session before protected handlers run.",
          "status": "pending",
          "parentId": null,
          "children": []
        }
      ]
    }
  ],
  "force": false
}
```

Task input keys are explicit so strict tool-schema bridges do not invent values for omitted properties. Use `description: null` when no detail is needed, `status: "pending"` for the default state, `parentId: null` for root tasks and nested children, and `children: []` for leaves. The published schema keeps nested task nodes inline instead of using recursive `$ref`/`$defs`, which avoids Cloud Code Assist schema-resolution failures while still accepting deeper runtime trees. `prepareArguments` still expands legacy calls that omit these fields.

IDs are not reused by append/remove operations; `replace` deliberately rebuilds IDs from `1`. Replace forbids non-null `parentId`, so new hierarchy must use nested `children`. Multiple tasks may be `in-progress`. A parent can be marked `done` only when all descendants are also `done`.

A task starts timing the first time it enters `in-progress`. Leaving that state records a stop and pauses the timer; entering it again resumes with a new active segment while preserving the cumulative duration. Repeated updates with the same status, as well as name, description, hierarchy, and position changes, do not reset timing. For started tasks, `get_task` includes the first `startedAt` timestamp, a `stoppedAt` timestamp while paused, and cumulative `durationMs`. Timestamps use ISO 8601.

## Pi Widget

The widget appears above Pi's editor while tasks exist. Run `/tasks` to hide or show it for the current Pi runtime.

```text
 Tasks 2/6 · !1  ━━━━━────────
  ◉ 1. Build auth · 12:08
  ├─ ! 3. Resolve token issue · 03:41
  └─ ○ 4. Add middleware
  ✓ 2. Define schema · 04:31
```

Tool calls remain compact in the conversation. Expand a tool result with Pi's normal tool-output shortcut to inspect affected tasks or full descriptions.

## Herdr Integration

When Pi runs inside Herdr, the extension reports the most specific `in-progress` task as a `task` pane metadata token. If nothing is in progress, it falls back to a blocked task. Parallel current tasks use a separate `task_count` token so Herdr can truncate long task names responsively while keeping the remaining count visible, for example `#7 Implement auth · +2`. The `task_progress` token reports aggregate completion as `done/total` while tasks remain unfinished and is omitted once all tasks are complete.

Add `$task`, `$task_count`, and `$task_progress` to the Herdr agent sidebar in `~/.config/herdr/config.toml`:

```toml
[ui.sidebar.agents]
rows = [["state_icon", "workspace", "tab"], ["$ask", "$ask_count"], ["$task_progress", "$task", "$task_count"]]
```

Apply the change to a running Herdr server:

```bash
herdr server reload-config
```

Metadata failures never block task operations. The extension does not change Herdr's agent lifecycle or notification state.

## Development

```bash
npm install
npm run typecheck
npm test
npm pack --dry-run
```

The package has no third-party runtime dependencies. Pi's runtime packages are declared as peers and supplied by Pi.

## License

MIT
