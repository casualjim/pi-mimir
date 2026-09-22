import assert from "node:assert/strict";
import test from "node:test";
import piTodoHerdr from "../index.ts";
import {
  COMPACTION_REMINDER,
  COMPACTION_REMINDER_TYPE,
  formatCompactTaskTree,
  hasUnfinishedTasks,
  TASK_PROMPT_GUIDELINES,
} from "../src/prompt.ts";
import { TaskState } from "../src/state.ts";

test("keeps task guidance short with planning after exploration", () => {
  assert.equal(TASK_PROMPT_GUIDELINES.length, 2);
  const prompt = TASK_PROMPT_GUIDELINES.join("\n");
  assert.match(prompt, /work with 3\+ distinct steps/);
  assert.match(prompt, /explore enough to understand the scope/);
  assert.match(prompt, /then call set_tasks before implementation/);
  assert.match(prompt, /otherwise skip tracking/);
  assert.match(prompt, /Start one task in-progress/);
  assert.match(prompt, /update_task when tasks start, block, or finish/);
  assert.match(prompt, /keep statuses accurate before the final response/);
  assert.ok(prompt.split(/\s+/).length < 40);
});

test("uses a compact one-shot recovery reminder without embedding task data", () => {
  assert.equal(
    COMPACTION_REMINDER,
    "Active tasks exist. Call list_task now; treat its result as authoritative.",
  );
  assert.equal(COMPACTION_REMINDER.split(/\s+/).length, 11);
  assert.doesNotMatch(COMPACTION_REMINDER, /pending|in-progress|blocked|done/);
});

test("reminds after compaction only while unfinished tasks exist", () => {
  const state = new TaskState();
  assert.equal(hasUnfinishedTasks(state.list()), false);

  state.add([{ name: "Pending" }]);
  assert.equal(hasUnfinishedTasks(state.list()), true);

  state.update([{ id: 1, status: "done" }]);
  assert.equal(hasUnfinishedTasks(state.list()), false);
});

test("formats the compact authoritative tree without descriptions", () => {
  const state = new TaskState();
  state.add([
    {
      name: "Parent",
      description: "Detailed context that should not appear.",
      status: "in-progress",
      children: [{ name: "Child" }],
    },
  ]);
  assert.equal(
    formatCompactTaskTree(state.list()),
    "1 [in-progress] Parent\n└─ 2 [pending] Child",
  );
});

test("session_compact sends one hidden reminder only for unfinished tasks", async () => {
  const handlers = new Map<string, (event: any, ctx: any) => unknown>();
  const tools = new Map<string, any>();
  const sent: Array<{ message: any; options: any }> = [];
  const pi = {
    on(name: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(name, handler);
    },
    registerTool(tool: any) {
      tools.set(tool.name, tool);
    },
    registerCommand() {},
    sendMessage(message: any, options: any) {
      sent.push({ message, options });
    },
  };
  piTodoHerdr(pi as never);
  const ctx = { ui: { setWidget() {} } };

  await tools.get("set_tasks").execute(
    "set",
    { mode: "append", tasks: [{ name: "Continue work", status: "in-progress" }] },
    undefined,
    undefined,
    ctx,
  );
  handlers.get("session_compact")?.({}, ctx);
  assert.deepEqual(sent, [
    {
      message: {
        customType: COMPACTION_REMINDER_TYPE,
        content: COMPACTION_REMINDER,
        display: false,
      },
      options: { deliverAs: "steer" },
    },
  ]);

  await tools.get("update_task").execute(
    "update",
    { tasks: [{ id: 1, status: "done" }] },
    undefined,
    undefined,
    ctx,
  );
  handlers.get("session_compact")?.({}, ctx);
  assert.equal(sent.length, 1);
});
