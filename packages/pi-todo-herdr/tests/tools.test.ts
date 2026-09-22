import assert from "node:assert/strict";
import test from "node:test";
import { validateToolArguments } from "../node_modules/@earendil-works/pi-ai/dist/utils/validation.js";
import { TaskState } from "../src/state.ts";
import { registerTaskTools } from "../src/tools.ts";

function registeredTools(state = new TaskState()) {
  const tools = new Map<string, any>();
  let changes = 0;
  const pi = {
    registerTool(tool: any) {
      tools.set(tool.name, tool);
    },
  };
  registerTaskTools(pi as never, state, () => {
    changes += 1;
  });
  return { tools, state, changes: () => changes };
}

async function execute(tool: any, params: unknown) {
  const prepared = tool.prepareArguments?.(params) ?? params;
  const validated = validateToolArguments(tool, { name: tool.name, arguments: prepared } as never);
  return tool.execute("call", validated, undefined, undefined, {});
}

test("registers five focused tools without the old add_task alias", () => {
  const { tools } = registeredTools();
  assert.deepEqual([...tools.keys()], ["set_tasks", "update_task", "rm_task", "list_task", "get_task"]);
  assert.deepEqual(Object.keys(tools.get("set_tasks").parameters.properties), ["mode", "tasks", "force"]);
  assert.deepEqual(Object.keys(tools.get("update_task").parameters.properties), ["tasks"]);
  assert.deepEqual(Object.keys(tools.get("rm_task").parameters.properties), ["ids", "reason"]);
  assert.deepEqual(Object.keys(tools.get("list_task").parameters.properties), []);
  assert.deepEqual(Object.keys(tools.get("get_task").parameters.properties), ["ids"]);
});

test("set_tasks schema stays inline for Cloud Code Assist recursive-schema bridges", () => {
  const { tools } = registeredTools();
  const params = tools.get("set_tasks").parameters;
  const itemSchema = params.properties.tasks.items;
  assert.deepEqual(params.required, ["mode", "tasks", "force"]);
  assert.deepEqual(itemSchema.required, ["name", "description", "status", "parentId", "children"]);
  assert.equal(itemSchema.type, "object");
  assert.equal(itemSchema.properties.children.type, "array");
  assert.equal(itemSchema.properties.children.items.type, "object");

  // pi-antigravity strips $defs before sending Cloud Code Assist declarations.
  // Recursive refs then become undefined at the second nested child level, so
  // this tool must never expose a $ref/$defs node to the provider bridge.
  const serialized = JSON.stringify(params);
  assert.doesNotMatch(serialized, /\"\$(?:ref|defs)\"/);
  assert.doesNotMatch(serialized, /\"definitions\"/);
});

test("strict task schemas normalize legacy optional arguments", () => {
  const { tools } = registeredTools();
  const setTool = tools.get("set_tasks");
  const updateTool = tools.get("update_task");

  assert.deepEqual(updateTool.parameters.properties.tasks.items.required, [
    "id",
    "name",
    "description",
    "status",
    "parentId",
    "position",
  ]);
  assert.deepEqual(setTool.prepareArguments({
    mode: "append",
    tasks: [{ name: "Parent", children: [{ name: "Child" }] }],
  }), {
    mode: "append",
    tasks: [
      {
        name: "Parent",
        description: null,
        status: "pending",
        parentId: null,
        children: [
          {
            name: "Child",
            description: null,
            status: "pending",
            parentId: null,
            children: [],
          },
        ],
      },
    ],
    force: false,
  });
  assert.deepEqual(updateTool.prepareArguments({ tasks: [{ id: 1, status: "done" }] }), {
    tasks: [
      {
        id: 1,
        name: null,
        description: null,
        status: "done",
        parentId: -1,
        position: -1,
      },
    ],
  });
  assert.equal(updateTool.prepareArguments({ tasks: [{ id: 1, parentId: null }] }).tasks[0].parentId, 0);

  const validated = validateToolArguments(updateTool, {
    name: "update_task",
    arguments: updateTool.prepareArguments({ tasks: [{ id: 1, status: "done" }] }),
  } as never);
  assert.equal(validated.tasks[0].parentId, -1);
  assert.equal(validated.tasks[0].position, -1);
});

test("validated update sentinels preserve order and map legacy null parent to root", async () => {
  const harness = registeredTools();
  await execute(harness.tools.get("set_tasks"), {
    mode: "append",
    tasks: [
      { name: "Parent", children: [{ name: "Child" }] },
      { name: "Sibling" },
    ],
  });

  await execute(harness.tools.get("update_task"), { tasks: [{ id: 3, status: "blocked" }] });
  assert.deepEqual(
    harness.state.list().filter((task) => task.parentId === null).map((task) => task.id),
    [1, 3],
  );

  await execute(harness.tools.get("update_task"), { tasks: [{ id: 2, parentId: null }] });
  assert.equal(harness.state.get([2])[0]?.parentId, null);
});

test("set_tasks appends optional-description tasks and persists a complete snapshot", async () => {
  const harness = registeredTools();
  const result = await execute(harness.tools.get("set_tasks"), {
    mode: "append",
    tasks: [{ name: "Parent", children: [{ name: "Child", description: "Useful detail" }] }],
  });

  assert.equal(result.content[0].text, "Added 2 tasks: 1, 2. 0/2 done.");
  assert.equal(result.details.action, "append");
  assert.equal(result.details.snapshot.tasks.length, 2);
  assert.equal(result.details.snapshot.tasks[0].description, undefined);
  assert.equal(result.details.snapshot.nextId, 3);
  assert.equal(harness.changes(), 1);
});

test("set_tasks atomically replaces or clears the tree and resets IDs", async () => {
  const harness = registeredTools();
  await execute(harness.tools.get("set_tasks"), {
    mode: "append",
    tasks: [{ name: "Old", status: "done" }],
  });

  const replaced = await execute(harness.tools.get("set_tasks"), {
    mode: "replace",
    tasks: [{ name: "New", status: "in-progress" }],
  });
  assert.equal(replaced.content[0].text, "Replaced task tree with 1 task. 0/1 done. Task IDs restart at 1.");
  assert.deepEqual(harness.state.list().map((task) => [task.id, task.name]), [[1, "New"]]);

  const cleared = await execute(harness.tools.get("set_tasks"), {
    mode: "replace",
    tasks: [],
    force: true,
  });
  assert.equal(cleared.content[0].text, "Cleared task tree. Task IDs reset to 1.");
  assert.deepEqual(harness.state.snapshot(), { tasks: [], nextId: 1 });
});

test("tool validation errors preserve atomic state", async () => {
  const harness = registeredTools();
  await execute(harness.tools.get("set_tasks"), {
    mode: "append",
    tasks: [{ name: "Parent", children: [{ name: "Child" }] }],
  });
  const before = harness.state.snapshot();

  await assert.rejects(
    execute(harness.tools.get("update_task"), { tasks: [{ id: 1, parentId: 2 }] }),
    /Update failed · 1 validation error\n- task [12]: parentId creates a cycle/,
  );
  assert.deepEqual(harness.state.snapshot(), before);
  assert.equal(harness.changes(), 1);
});

test("rm_task requires and reports a constrained removal reason", async () => {
  const harness = registeredTools();
  await execute(harness.tools.get("set_tasks"), {
    mode: "append",
    tasks: [{ name: "Duplicate" }],
  });
  const removed = await execute(harness.tools.get("rm_task"), { ids: [1], reason: "duplicate" });
  assert.match(removed.content[0].text, /Reason: duplicate\.$/);
  assert.deepEqual(harness.state.list(), []);
});

test("list is compact and get returns available details for multiple IDs", async () => {
  const harness = registeredTools();
  await execute(harness.tools.get("set_tasks"), {
    mode: "append",
    tasks: [{ name: "Parent", description: "Detailed", children: [{ name: "Child" }] }],
  });

  const list = await execute(harness.tools.get("list_task"), {});
  assert.equal(list.content[0].text, "1 [pending] Parent\n└─ 2 [pending] Child");

  const get = await execute(harness.tools.get("get_task"), { ids: [1, 2] });
  const parsed = JSON.parse(get.content[0].text);
  assert.equal(parsed[0].description, "Detailed");
  assert.deepEqual(parsed[0].childrenIds, [2]);
  assert.equal(parsed[1].description, undefined);
  assert.equal(parsed[1].parentId, 1);
});

test("get_task exposes cumulative timing while list output stays compact", async () => {
  const startedAt = Date.UTC(2026, 0, 1);
  let now = startedAt;
  const harness = registeredTools(new TaskState(() => now));
  const added = await execute(harness.tools.get("set_tasks"), {
    mode: "append",
    tasks: [{ name: "Timed", status: "in-progress" }],
  });
  assert.equal(added.content[0].text, "Added 1 task: 1. 0/1 done.");
  assert.equal(added.details.snapshot.timings[0].activeStartedAt, startedAt);

  now += 65_432;
  const list = await execute(harness.tools.get("list_task"), {});
  assert.equal(list.content[0].text, "1 [in-progress] Timed");

  const active = JSON.parse((await execute(harness.tools.get("get_task"), { ids: [1] })).content[0].text);
  assert.deepEqual(active[0], {
    id: 1,
    name: "Timed",
    status: "in-progress",
    parentId: null,
    childrenIds: [],
    startedAt: new Date(startedAt).toISOString(),
    durationMs: 65_432,
  });

  now += 568;
  const updated = await execute(harness.tools.get("update_task"), {
    tasks: [{ id: 1, status: "blocked" }],
  });
  assert.equal(updated.content[0].text, "Updated 1 task: 1. 0/1 done.");

  now += 10_000;
  const paused = JSON.parse((await execute(harness.tools.get("get_task"), { ids: [1] })).content[0].text);
  assert.equal(paused[0].startedAt, new Date(startedAt).toISOString());
  assert.equal(paused[0].stoppedAt, new Date(startedAt + 66_000).toISOString());
  assert.equal(paused[0].durationMs, 66_000);
});
