import assert from "node:assert/strict";
import test from "node:test";
import { TaskState } from "../src/state.ts";
import { TaskValidationError } from "../src/types.ts";

function names(state: TaskState): string[] {
  return state.list().filter((task) => task.parentId === null).map((task) => task.name);
}

test("adds a nested batch with generated preorder IDs and derived relations", () => {
  const state = new TaskState();
  const added = state.add([
    {
      name: "Parent",
      description: "Parent description",
      children: [
        { name: "First child", description: "First" },
        { name: "Second child", description: "Second", status: "blocked" },
      ],
    },
  ]);

  assert.deepEqual(added.map((task) => task.id), [1, 2, 3]);
  assert.deepEqual(state.get([1])[0]?.childrenIds, [2, 3]);
  assert.equal(state.get([2])[0]?.parentId, 1);
  assert.equal(state.get([2])[0]?.status, "pending");
  assert.equal(state.snapshot().nextId, 4);
});

test("rejects invalid nested parentId atomically while accepting null sentinels", () => {
  const state = new TaskState();
  state.add([{ name: "Existing", description: "Existing" }]);
  const before = state.snapshot();

  assert.throws(
    () =>
      state.add([
        {
          name: "Parent",
          description: "Parent",
          children: [{ name: "Child", description: "Child", parentId: 1 }],
        },
      ]),
    TaskValidationError,
  );
  assert.deepEqual(state.snapshot(), before);

  const added = state.add([
    {
      name: "Nullable parent",
      parentId: null,
      children: [{ name: "Implicit child", parentId: null }],
    },
  ]);
  assert.equal(added[0]?.parentId, null);
  assert.equal(added[1]?.parentId, added[0]?.id);
});

test("enforces done descendants against the final atomic update state", () => {
  const state = new TaskState();
  state.add([{ name: "Parent", description: "Parent", children: [{ name: "Child", description: "Child" }] }]);
  const before = state.snapshot();

  assert.throws(() => state.update([{ id: 1, status: "done" }]), /unfinished descendants/);
  assert.deepEqual(state.snapshot(), before);

  state.update([
    { id: 2, status: "done" },
    { id: 1, status: "done" },
  ]);
  assert.deepEqual(state.list().map((task) => task.status), ["done", "done"]);

  assert.throws(() => state.update([{ id: 2, status: "in-progress" }]), /unfinished descendants/);
  state.update([
    { id: 1, status: "in-progress" },
    { id: 2, status: "in-progress" },
  ]);
  assert.deepEqual(state.list().map((task) => task.status), ["in-progress", "in-progress"]);
});

test("preserves and accumulates timing across repeated updates and status changes", () => {
  const startedAt = Date.UTC(2026, 0, 1);
  let now = startedAt;
  const state = new TaskState(() => now);

  const [started] = state.add([{ name: "Timed", status: "in-progress" }]);
  assert.equal(started?.startedAt, new Date(startedAt).toISOString());
  assert.equal(started?.stoppedAt, undefined);
  assert.equal(started?.durationMs, 0);

  now += 5_000;
  const [repeated] = state.update([{ id: 1, name: "Renamed", status: "in-progress" }]);
  assert.equal(repeated?.startedAt, started?.startedAt);
  assert.equal(repeated?.stoppedAt, undefined);
  assert.equal(repeated?.durationMs, 5_000);

  now += 2_000;
  const [paused] = state.update([{ id: 1, status: "blocked" }]);
  assert.equal(paused?.startedAt, started?.startedAt);
  assert.equal(paused?.stoppedAt, new Date(now).toISOString());
  assert.equal(paused?.durationMs, 7_000);

  now += 10_000;
  assert.equal(state.get([1])[0]?.durationMs, 7_000);
  const [resumed] = state.update([{ id: 1, status: "in-progress" }]);
  assert.equal(resumed?.startedAt, started?.startedAt);
  assert.equal(resumed?.stoppedAt, undefined);
  assert.equal(resumed?.durationMs, 7_000);

  now += 3_000;
  const [done] = state.update([{ id: 1, status: "done" }]);
  assert.equal(done?.startedAt, started?.startedAt);
  assert.equal(done?.stoppedAt, new Date(now).toISOString());
  assert.equal(done?.durationMs, 10_000);
  assert.deepEqual(state.snapshot().timings, [
    { taskId: 1, startedAt, stoppedAt: now, accumulatedMs: 10_000 },
  ]);
});

test("does not stop a timer when an atomic update fails", () => {
  const startedAt = Date.UTC(2026, 0, 1);
  let now = startedAt;
  const state = new TaskState(() => now);
  state.add([
    {
      name: "Parent",
      status: "in-progress",
      children: [{ name: "Unfinished child" }],
    },
  ]);

  now += 5_000;
  assert.throws(() => state.update([{ id: 1, status: "done" }]), /unfinished descendants/);
  const afterFailure = state.get([1])[0];
  assert.equal(afterFailure?.stoppedAt, undefined);
  assert.equal(afterFailure?.durationMs, 5_000);

  now += 2_000;
  assert.equal(state.get([1])[0]?.durationMs, 7_000);
});

test("restores timers and starts legacy in-progress snapshots at load time", () => {
  const startedAt = Date.UTC(2026, 0, 1);
  let now = startedAt;
  const source = new TaskState(() => now);
  source.add([{ name: "Persisted", status: "in-progress" }]);
  now += 2_500;
  source.update([{ id: 1, status: "pending" }]);

  now += 20_000;
  const restored = new TaskState(() => now);
  restored.restore(source.snapshot());
  assert.equal(restored.get([1])[0]?.startedAt, new Date(startedAt).toISOString());
  assert.equal(restored.get([1])[0]?.stoppedAt, new Date(startedAt + 2_500).toISOString());
  assert.equal(restored.get([1])[0]?.durationMs, 2_500);

  const legacy = new TaskState(() => now);
  legacy.restore({
    tasks: [
      {
        id: 1,
        name: "Legacy active",
        status: "in-progress",
        parentId: null,
        childrenIds: [],
      },
    ],
    nextId: 2,
  });
  assert.equal(legacy.get([1])[0]?.startedAt, new Date(now).toISOString());
  assert.equal(legacy.get([1])[0]?.durationMs, 0);
  assert.equal(legacy.snapshot().timings?.[0]?.activeStartedAt, now);
});

test("rejects out-of-range persisted timestamps without replacing state", () => {
  const state = new TaskState(() => 0);
  state.add([{ name: "Keep" }]);
  const before = state.snapshot();

  assert.throws(
    () =>
      state.restore({
        tasks: [
          {
            id: 1,
            name: "Corrupt timer",
            status: "in-progress",
            parentId: null,
            childrenIds: [],
          },
        ],
        nextId: 2,
        timings: [
          {
            taskId: 1,
            startedAt: Number.MAX_SAFE_INTEGER,
            activeStartedAt: Number.MAX_SAFE_INTEGER,
            accumulatedMs: 0,
          },
        ],
      }),
    /startedAt must be a valid non-negative timestamp/,
  );
  assert.deepEqual(state.snapshot(), before);
});

test("finalizes an active timer in removed task details", () => {
  let now = Date.UTC(2026, 0, 1);
  const state = new TaskState(() => now);
  state.add([{ name: "Canceled", status: "in-progress" }]);
  now += 4_000;

  const [removed] = state.remove([1]);
  assert.equal(removed?.stoppedAt, new Date(now).toISOString());
  assert.equal(removed?.durationMs, 4_000);
  assert.deepEqual(state.list(), []);
});

test("rejects cycles and duplicate patches without partial changes", () => {
  const state = new TaskState();
  state.add([{ name: "Root", description: "Root", children: [{ name: "Child", description: "Child" }] }]);
  const before = state.snapshot();

  assert.throws(() => state.update([{ id: 1, parentId: 2 }, { id: 2, name: "Changed" }]), /cycle/);
  assert.deepEqual(state.snapshot(), before);

  assert.throws(() => state.update([{ id: 2, name: "One" }, { id: 2, name: "Two" }]), /duplicate task patches/);
  assert.deepEqual(state.snapshot(), before);
});

test("reorders roots with zero-based sequential positions", () => {
  const state = new TaskState();
  state.add([
    { name: "A", description: "A" },
    { name: "B", description: "B" },
    { name: "C", description: "C" },
  ]);

  state.update([{ id: 1, position: 2 }]);
  assert.deepEqual(names(state), ["B", "C", "A"]);

  state.update([
    { id: 1, position: 0 },
    { id: 2, position: 2 },
  ]);
  assert.deepEqual(names(state), ["A", "C", "B"]);
});

test("reparents and positions tasks among their final siblings", () => {
  const state = new TaskState();
  state.add([
    {
      name: "One",
      description: "One",
      children: [
        { name: "A", description: "A" },
        { name: "B", description: "B" },
      ],
    },
    { name: "Two", description: "Two", children: [{ name: "C", description: "C" }] },
  ]);

  state.update([{ id: 3, parentId: 4, position: 0 }]);
  assert.deepEqual(state.get([4])[0]?.childrenIds, [3, 5]);
  assert.deepEqual(state.get([1])[0]?.childrenIds, [2]);
});

test("removes overlapping parent and child IDs as one cascade", () => {
  const state = new TaskState();
  state.add([
    {
      name: "Root",
      description: "Root",
      children: [{ name: "Child", description: "Child", children: [{ name: "Leaf", description: "Leaf" }] }],
    },
    { name: "Keep", description: "Keep" },
  ]);

  const removed = state.remove([1, 2, 1]);
  assert.deepEqual(removed.map((task) => task.id), [1, 2, 3]);
  assert.deepEqual(state.list().map((task) => task.id), [4]);
  assert.equal(state.snapshot().nextId, 5);

  const before = state.snapshot();
  assert.throws(() => state.remove([999]), /do not exist/);
  assert.deepEqual(state.snapshot(), before);
});

test("restores snapshots and never reuses deleted IDs", () => {
  const state = new TaskState();
  state.add([{ name: "One", description: "One" }, { name: "Two", description: "Two" }]);
  state.remove([2]);
  const snapshot = state.snapshot();

  const restored = new TaskState();
  restored.restore(snapshot);
  const added = restored.add([{ name: "Three", description: "Three" }]);
  assert.equal(added[0]?.id, 3);
});

test("loads the latest valid mutation snapshot from a session branch", () => {
  const first = new TaskState();
  first.add([{ name: "First", description: "First" }]);
  const second = new TaskState();
  second.restore(first.snapshot());
  second.add([{ name: "Second", description: "Second" }]);

  const branch = [first.snapshot(), second.snapshot()].map((snapshot, index) => ({
    type: "message",
    message: {
      role: "toolResult",
      toolName: index === 0 ? "add_task" : "update_task",
      details: { action: "add", snapshot, affected: [] },
    },
  }));
  const state = new TaskState();
  state.loadFromSession({ sessionManager: { getBranch: () => branch } } as never);
  assert.deepEqual(state.list().map((task) => task.name), ["First", "Second"]);
});

test("supports nullable descriptions and reports invalid children as validation errors", () => {
  const state = new TaskState();
  assert.throws(() => state.add([{ name: "Bad\nname", description: "Valid" }]), /single line/);
  assert.throws(() => state.add([{ name: "Blank description", description: "  " }]), /must not be empty/);
  assert.throws(
    () => state.add([{ name: "Invalid children", children: "not-an-array" } as never]),
    /children must be an array/,
  );
  state.add([
    { name: "No description" },
    { name: "Null description", description: null },
    { name: "Detailed", description: "Line one\nLine two" },
  ]);
  assert.equal(state.list()[0]?.description, undefined);
  assert.equal(state.list()[1]?.description, undefined);
  assert.equal(state.list()[2]?.description, "Line one\nLine two");
});

test("set append accepts false force and rejects true force", () => {
  const state = new TaskState();
  assert.throws(() => state.set("append", [], false), /tasks must not be empty/);
  state.set("append", [{ name: "Task" }], false);
  const before = state.snapshot();
  assert.throws(() => state.set("append", [{ name: "Other" }], true), /force must be false in append mode/);
  assert.deepEqual(state.snapshot(), before);
});

test("set replace is atomic, guarded, and resets IDs", () => {
  const state = new TaskState();
  state.add([{ name: "Old", status: "in-progress" }]);
  const before = state.snapshot();

  assert.throws(() => state.set("replace", [{ name: "New" }]), /requires force/);
  assert.throws(
    () => state.set("replace", [{ name: "Invalid parent", parentId: 1 }], true),
    /parentId is not allowed in replace mode/,
  );
  assert.deepEqual(state.snapshot(), before);

  const replaced = state.set(
    "replace",
    [{ name: "New", parentId: null, children: [{ name: "Child", parentId: null }] }],
    true,
  );
  assert.deepEqual(replaced.map((task) => task.id), [1, 2]);
  assert.deepEqual(state.list().map((task) => task.name), ["New", "Child"]);
  assert.equal(state.snapshot().nextId, 3);

  state.set("replace", [], true);
  assert.deepEqual(state.snapshot(), { tasks: [], nextId: 1 });
});

test("set replace does not require force after all existing tasks are done", () => {
  const state = new TaskState();
  state.add([{ name: "Done", status: "done" }]);
  state.set("replace", [{ name: "Fresh" }]);
  assert.deepEqual(state.list().map((task) => [task.id, task.name]), [[1, "Fresh"]]);
});
