import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { currentTaskLabel, currentTaskTokens } from "../src/herdr.ts";
import { TaskState } from "../src/state.ts";
import {
  formatDuration,
  renderProgressHeader,
  renderTaskLine,
  renderToolResult,
  renderTree,
  renderWidgetTree,
  snapshotStats,
} from "../src/ui.ts";
import { updateTaskWidget } from "../src/widget.ts";

const plainTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  strikethrough: (text: string) => `~${text}~`,
};

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function fixture(): TaskState {
  const state = new TaskState(() => 0);
  state.add([
    {
      name: "Build auth",
      description: "Auth work",
      status: "in-progress",
      children: [
        {
          name: "Resolve token issue",
          description: "Investigate token validation and provider behavior.",
          status: "blocked",
          children: [{ name: "Inspect provider response", description: "Inspect response" }],
        },
        { name: "Add middleware", description: "Middleware" },
      ],
    },
    { name: "Define schema", description: "Schema", status: "done" },
  ]);
  return state;
}

test("renders an adaptive progress bar and stays within width", () => {
  const stats = fixture().stats();
  const wide = stripAnsi(renderProgressHeader(stats, plainTheme as never, 40));
  assert.match(wide, /^ Tasks 1\/5 · !1  ━{4}─{16}$/);
  assert.ok(visibleWidth(wide) <= 40);

  const narrow = renderProgressHeader(stats, plainTheme as never, 12);
  assert.ok(visibleWidth(narrow) <= 12);
  assert.doesNotMatch(stripAnsi(narrow), /━|─/);
});

test("renders lightweight connectors without a detached root continuation", () => {
  const output = renderTree(fixture().list(), plainTheme as never, 80).map(stripAnsi);
  assert.deepEqual(output, [
    "  ◉ 1. Build auth · 00:00",
    "  ├─ ! 2. Resolve token issue",
    "  │  └─ ○ 3. Inspect provider response",
    "  └─ ○ 4. Add middleware",
    "  ✓ 5. ~Define schema~",
  ]);
});

test("collapses completed widget subtrees while keeping list trees expanded", () => {
  const state = new TaskState(() => 0);
  state.add([
    {
      name: "Release",
      children: [
        {
          name: "Completed branch",
          children: [
            { name: "Done one", status: "done" },
            { name: "Done two", status: "done" },
          ],
        },
        { name: "Open branch", children: [{ name: "Open leaf" }] },
      ],
    },
    {
      name: "Pending parent",
      children: [{ name: "Finished child", status: "done" }],
    },
  ]);

  const widgetLines = renderWidgetTree(state.list(), plainTheme as never, 80).map(stripAnsi);
  assert.deepEqual(widgetLines, [
    "  ○ 1. Release",
    "  ├─ ○ 2. Completed branch · 2/2 done",
    "  └─ ○ 5. Open branch",
    "     └─ ○ 6. Open leaf",
    "  ○ 7. Pending parent · 1/1 done",
  ]);

  const fullTree = renderTree(state.list(), plainTheme as never, 80).map(stripAnsi);
  assert.ok(fullTree.some((line) => line.includes("Done one")));
  assert.ok(fullTree.some((line) => line.includes("Finished child")));

  state.update([{ id: 3, status: "pending" }]);
  const reopened = renderWidgetTree(state.list(), plainTheme as never, 80).map(stripAnsi);
  assert.ok(reopened.some((line) => line.includes("Done one")));
  assert.ok(reopened.some((line) => line.includes("Done two")));
});

test("hides a completed widget summary before squeezing the task name", () => {
  const state = new TaskState(() => 0);
  state.add([{ name: "A long parent task name", children: [{ name: "Done", status: "done" }] }]);

  const line = renderWidgetTree(state.list(), plainTheme as never, 20)[0] ?? "";
  assert.ok(visibleWidth(line) <= 20);
  assert.doesNotMatch(stripAnsi(line), /done$/);
});

test("formats compact timers and adds hours only when needed", () => {
  assert.equal(formatDuration(0), "00:00");
  assert.equal(formatDuration(65_432), "01:05");
  assert.equal(formatDuration(3_599_999), "59:59");
  assert.equal(formatDuration(3_600_000), "01:00:00");

  let now = 0;
  const state = new TaskState(() => now);
  state.add([{ name: "Timed", status: "in-progress" }]);
  now = 65_432;
  const line = stripAnsi(renderTaskLine(state.get([1])[0]!, "  ", plainTheme as never, 24));
  assert.match(line, / · 01:05$/);
  assert.ok(visibleWidth(line) <= 24);
});

test("truncates every task row at narrow widths", () => {
  const lines = renderTree(fixture().list(), plainTheme as never, 20);
  assert.ok(lines.every((line) => visibleWidth(line) <= 20));
  assert.ok(lines.some((line) => stripAnsi(line).includes("...")));
});

test("uses semantic icon colors and old-plugin text styling", () => {
  const calls: Array<{ color: string; text: string }> = [];
  const theme = {
    fg: (color: string, text: string) => {
      calls.push({ color, text });
      return text;
    },
    bold: (text: string) => text,
    strikethrough: (text: string) => `~${text}~`,
  };
  const tasks = fixture().list();
  for (const task of tasks) renderTaskLine(task, "", theme as never, 80);

  assert.ok(calls.some((call) => call.color === "dim" && call.text === "○"));
  assert.ok(calls.some((call) => call.color === "warning" && call.text === "◉"));
  assert.ok(calls.some((call) => call.color === "error" && call.text === "!"));
  assert.ok(calls.some((call) => call.color === "success" && call.text === "✓"));
  assert.ok(calls.some((call) => call.color === "warning" && call.text === "Build auth"));
  assert.ok(calls.some((call) => call.color === "dim" && call.text === "~Define schema~"));
  assert.ok(!calls.some((call) => call.color === "error" && call.text === "Resolve token issue"));
});

test("selects the most specific in-progress task and compresses parallel leaves", () => {
  const state = new TaskState();
  state.add([
    {
      name: "Parent",
      description: "Parent",
      status: "in-progress",
      children: [{ name: "Child", description: "Child", status: "in-progress" }],
    },
    { name: "Parallel", description: "Parallel", status: "in-progress" },
  ]);
  assert.equal(currentTaskLabel(state.list()), "#2 Child +1");
  assert.deepEqual(currentTaskTokens(state.list()), {
    task: "#2 Child",
    task_count: "+1",
    task_progress: "0/3",
  });
});

test("uses blocked tasks only when nothing is in progress", () => {
  const state = new TaskState();
  state.add([
    { name: "Blocked one", description: "One", status: "blocked" },
    { name: "Blocked two", description: "Two", status: "blocked" },
  ]);
  assert.equal(currentTaskLabel(state.list()), "#1 Blocked one +1");
  assert.deepEqual(currentTaskTokens(state.list()), {
    task: "#1 Blocked one",
    task_count: "+1",
    task_progress: "0/2",
  });
  state.update([{ id: 1, status: "done" }, { id: 2, status: "done" }]);
  assert.equal(currentTaskLabel(state.list()), null);
  assert.deepEqual(currentTaskTokens(state.list()), {
    task: null,
    task_count: null,
    task_progress: null,
  });
});

test("clears sidebar progress for an empty task tree", () => {
  assert.deepEqual(currentTaskTokens([]), {
    task: null,
    task_count: null,
    task_progress: null,
  });
});

test("hides an empty widget and renders a populated one", () => {
  let widget: unknown = "unset";
  const ctx = {
    ui: {
      setWidget: (_id: string, content: unknown) => {
        widget = content;
      },
    },
  };
  const state = new TaskState();
  updateTaskWidget(state, ctx as never, true);
  assert.equal(widget, undefined);

  state.add([{ name: "Task", description: "Task" }]);
  updateTaskWidget(state, ctx as never, true);
  assert.equal(typeof widget, "function");
  const component = (widget as unknown as (tui: unknown, theme: unknown) => { render(width: number): string[] })(
    {},
    plainTheme,
  );
  const lines = component.render(30);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => visibleWidth(line) <= 30));
});

test("live widgets request rerenders and dispose their interval", async () => {
  let now = 0;
  const state = new TaskState(() => now);
  state.add([{ name: "Timed", status: "in-progress" }]);

  let widget: unknown;
  const ctx = {
    ui: {
      setWidget: (_id: string, content: unknown) => {
        widget = content;
      },
    },
  };
  updateTaskWidget(state, ctx as never, true, 5);

  let renderRequests = 0;
  const component = (
    widget as unknown as (
      tui: { requestRender(): void },
      theme: unknown,
    ) => { render(width: number): string[]; dispose?(): void }
  )(
    {
      requestRender() {
        renderRequests += 1;
      },
    },
    plainTheme,
  );

  try {
    assert.match(stripAnsi(component.render(40)[1] ?? ""), / · 00:00$/);
    now = 65_000;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(renderRequests > 0);
    assert.match(stripAnsi(component.render(40)[1] ?? ""), / · 01:05$/);
  } finally {
    component.dispose?.();
  }

  const requestsAfterDispose = renderRequests;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(renderRequests, requestsAfterDispose);
});

test("tool results collapse summaries and expand themed details", () => {
  const state = fixture();
  const details = { action: "list" as const, snapshot: state.snapshot(), affected: state.list() };
  const result = { content: [{ type: "text", text: "list" }], details };
  const collapsed = renderToolResult(result, false, plainTheme as never).render(80).map(stripAnsi);
  assert.deepEqual(collapsed, ["✓ 5 tasks · 1/5 done"]);

  const expanded = renderToolResult(result, true, plainTheme as never).render(80).map(stripAnsi);
  assert.equal(expanded.length, 6);
  assert.match(expanded[1] ?? "", /Build auth/);
});

test("tool errors show one summary line until expanded", () => {
  const result = {
    content: [{ type: "text", text: "Update failed · 2 validation errors\n- first\n- second" }],
    isError: true,
  };
  const collapsed = renderToolResult(result, false, plainTheme as never).render(80).map(stripAnsi);
  assert.deepEqual(collapsed, ["✗ Update failed · 2 validation errors"]);
  const expanded = renderToolResult(result, true, plainTheme as never).render(80).map(stripAnsi);
  assert.deepEqual(expanded, ["✗ Update failed · 2 validation errors", "  - first", "  - second"]);
});

test("expanded task details tolerate an omitted description", () => {
  const state = new TaskState();
  state.add([{ name: "Name only" }]);
  const result = {
    content: [{ type: "text", text: "details" }],
    details: { action: "get" as const, snapshot: state.snapshot(), affected: state.list() },
  };
  const lines = renderToolResult(result, true, plainTheme as never).render(80).map(stripAnsi);
  assert.deepEqual(lines, ["✓ 1 task", "  ○ 1. Name only", "    Parent root · Children none"]);
});

test("snapshot stats count every task node", () => {
  assert.deepEqual(snapshotStats(fixture().list()), {
    total: 5,
    pending: 2,
    inProgress: 1,
    blocked: 1,
    done: 1,
  });
});
