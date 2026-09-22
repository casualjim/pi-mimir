import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static, type TSchema } from "typebox";
import { formatCompactTaskTree, TASK_PROMPT_GUIDELINES } from "./prompt.ts";
import type { TaskState } from "./state.ts";
import type { AddTaskDraft, Task, TaskPatch, TaskToolDetails } from "./types.ts";
import { TaskValidationError } from "./types.ts";
import { renderToolResult } from "./ui.ts";

const TaskStatusSchema = StringEnum(["pending", "in-progress", "blocked", "done"] as const, {
  description: "Task status.",
});

const SetTaskModeSchema = StringEnum(["append", "replace"] as const);
const RemovalReasonSchema = StringEnum(["mistaken", "duplicate", "canceled"] as const);

/**
 * Cloud Code Assist accepts inline tool schemas, but its Gemini bridge cannot
 * reliably resolve recursive $ref/$defs declarations, and Meta's API rejects
 * parameter schemas nesting deeper than 10 levels (HTTP 400
 * `JSON schema exceeds the maximum nesting depth of 10 levels`). Keep the
 * runtime task tree unbounded while exposing a shallow finite shape to the
 * model. Beyond the inline depth, an open object still lets the model send
 * deeper task nodes; prepareArguments supplies the same defaults at every
 * level. Guarded by tests/schema-depth.test.ts.
 */
const OPEN_TASK_NODE_SCHEMA = Type.Object(
	{
		name: Type.Optional(Type.String({ minLength: 1 })),
	},
	{
		description: "A deeper nested task node. It may contain the same task fields, including children.",
	},
);

// ponytail: depth 1 keeps the serialized schema at 7 levels (worst case, with
// property/items/anyOf each counted); depth 2 already reaches ~10 and trips
// Meta's limit. Deeper trees still flow through the open tail node at runtime.
const TASK_NODE_SCHEMA_DEPTH = 1;

function taskNodeSchema(children: TSchema): TSchema {
  return Type.Object(
    {
      name: Type.String({ minLength: 1 }),
      description: Type.Union([Type.String({ minLength: 1 }), Type.Null()], {
        description: "Detailed scope, constraints, and done criteria; use null when no detail is needed.",
      }),
      status: TaskStatusSchema,
      parentId: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()], {
        description: "Existing parent ID for a top-level append; use null for roots, nested children, and replace mode.",
      }),
      children: Type.Array(children, {
        description: "Nested child tasks using the same task-node shape.",
      }),
    },
    { additionalProperties: false },
  );
}

let nestedTaskSchema: TSchema = OPEN_TASK_NODE_SCHEMA;
for (let depth = 0; depth < TASK_NODE_SCHEMA_DEPTH; depth += 1) {
  nestedTaskSchema = taskNodeSchema(nestedTaskSchema);
}
const AddTaskSchema = taskNodeSchema(nestedTaskSchema);

export const SetTaskParams = Type.Object(
  {
    mode: SetTaskModeSchema,
    tasks: Type.Array(AddTaskSchema, {
      description: "Tasks to append or install. May be empty only in replace mode.",
    }),
    force: Type.Boolean({
      description: "Set true only when the user explicitly abandons unfinished tasks; otherwise use false.",
    }),
  },
  { additionalProperties: false },
);

const TaskPatchSchema = Type.Object(
  {
    id: Type.Integer({ minimum: 1 }),
    name: Type.Union([Type.String({ minLength: 1 }), Type.Null()], {
      description: "New name, or null to leave it unchanged.",
    }),
    description: Type.Union([Type.String({ minLength: 1 }), Type.Null()], {
      description: "New description, or null to leave it unchanged.",
    }),
    status: Type.Union([TaskStatusSchema, Type.Null()], {
      description: "New status, or null to leave it unchanged.",
    }),
    parentId: Type.Integer({
      minimum: -1,
      description: "New parent ID; use -1 to leave it unchanged and 0 to move to root.",
    }),
    position: Type.Integer({
      minimum: -1,
      description: "Zero-based position among final siblings, or -1 to leave it unchanged.",
    }),
  },
  { additionalProperties: false },
);

export const UpdateTaskParams = Type.Object(
  {
    tasks: Type.Array(TaskPatchSchema, { minItems: 1, description: "Task patches applied atomically in array order." }),
  },
  { additionalProperties: false },
);

const TaskIdsSchema = Type.Array(Type.Integer({ minimum: 1 }), {
  minItems: 1,
  description: "Task IDs to process. Duplicate IDs are deduplicated.",
});

export const RemoveTaskParams = Type.Object(
  {
    ids: TaskIdsSchema,
    reason: RemovalReasonSchema,
  },
  { additionalProperties: false },
);

export const IdsParams = Type.Object({ ids: TaskIdsSchema }, { additionalProperties: false });

export const ListTaskParams = Type.Object({}, { additionalProperties: false });

function prepareTaskDraft(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const children =
    input.children === undefined
      ? []
      : Array.isArray(input.children)
        ? input.children.map(prepareTaskDraft)
        : input.children;
  return {
    ...input,
    description: input.description === undefined ? null : input.description,
    status: input.status === undefined ? "pending" : input.status,
    parentId: input.parentId === undefined ? null : input.parentId,
    children,
  };
}

function prepareSetTaskArguments(value: unknown): Static<typeof SetTaskParams> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value as Static<typeof SetTaskParams>;
  }
  const input = value as Record<string, unknown>;
  return {
    ...input,
    tasks: Array.isArray(input.tasks) ? input.tasks.map(prepareTaskDraft) : input.tasks,
    force: input.force === undefined ? false : input.force,
  } as Static<typeof SetTaskParams>;
}

function prepareTaskPatch(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  return {
    ...input,
    name: input.name === undefined ? null : input.name,
    description: input.description === undefined ? null : input.description,
    status: input.status === undefined ? null : input.status,
    parentId: input.parentId === undefined ? -1 : input.parentId === null ? 0 : input.parentId,
    position: input.position === undefined || input.position === null ? -1 : input.position,
  };
}

function prepareUpdateTaskArguments(value: unknown): Static<typeof UpdateTaskParams> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value as Static<typeof UpdateTaskParams>;
  }
  const input = value as Record<string, unknown>;
  return {
    ...input,
    tasks: Array.isArray(input.tasks) ? input.tasks.map(prepareTaskPatch) : input.tasks,
  } as Static<typeof UpdateTaskParams>;
}

interface SetTaskInput {
  mode: "append" | "replace";
  tasks: unknown[];
  force?: boolean;
}

interface UpdateTaskInput {
  tasks: TaskPatch[];
}

interface IdsInput {
  ids: number[];
}

interface RemoveTaskInput extends IdsInput {
  reason: "mistaken" | "duplicate" | "canceled";
}

type ChangeHandler = (ctx: ExtensionContext) => void;

function taskIds(tasks: Task[]): string {
  return tasks.map((task) => task.id).join(", ");
}

function details(action: TaskToolDetails["action"], state: TaskState, affected: Task[]): TaskToolDetails {
  return { action, snapshot: state.snapshot(), affected };
}

function mutationText(verb: string, affected: Task[], state: TaskState): string {
  const stats = state.stats();
  return `${verb} ${affected.length} task${affected.length === 1 ? "" : "s"}: ${taskIds(affected)}. ${stats.done}/${stats.total} done.`;
}

function setTaskText(mode: SetTaskInput["mode"], affected: Task[], state: TaskState): string {
  if (mode === "append") return mutationText("Added", affected, state);
  if (affected.length === 0) return "Cleared task tree. Task IDs reset to 1.";
  const stats = state.stats();
  return `Replaced task tree with ${affected.length} task${affected.length === 1 ? "" : "s"}. ${stats.done}/${stats.total} done. Task IDs restart at 1.`;
}

function throwToolError(label: string, error: unknown): never {
  if (error instanceof TaskValidationError) {
    const count = error.errors.length;
    throw new Error(
      `${label} failed · ${count} validation error${count === 1 ? "" : "s"}\n${error.errors.map((item) => `- ${item}`).join("\n")}`,
    );
  }
  throw error;
}

function renderCall(title: string, count: number | undefined, theme: Theme): Text {
  const suffix = count === undefined ? "" : theme.fg("dim", ` (${count})`);
  return new Text(theme.fg("toolTitle", theme.bold(title)) + suffix, 0, 0);
}

function notifyChange(onChange: ChangeHandler, ctx: ExtensionContext): void {
  try {
    onChange(ctx);
  } catch (error) {
    console.error("[pi-todo-herdr] failed to refresh task UI:", error);
  }
}

export function registerTaskTools(pi: ExtensionAPI, state: TaskState, onChange: ChangeHandler): void {
  pi.registerTool({
    name: "set_tasks",
    label: "Set Tasks",
    description:
      "Atomically append tasks or replace the task tree. Pass force false unless unfinished work is explicitly discarded.",
    promptGuidelines: [...TASK_PROMPT_GUIDELINES],
    parameters: SetTaskParams,
    prepareArguments: prepareSetTaskArguments,
    async execute(_toolCallId, params: SetTaskInput, _signal, _onUpdate, ctx) {
      try {
        const affected = state.set(params.mode, params.tasks as AddTaskDraft[], params.force);
        notifyChange(onChange, ctx);
        return {
          content: [{ type: "text" as const, text: setTaskText(params.mode, affected, state) }],
          details: details(params.mode, state, affected),
        };
      } catch (error) {
        throwToolError("Set", error);
      }
    },
    renderCall(args: SetTaskInput, theme: Theme) {
      return renderCall(`Set Tasks · ${args.mode}`, args.tasks?.length, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderToolResult(result, expanded, theme);
    },
  });

  pi.registerTool({
    name: "update_task",
    label: "Update Tasks",
    description:
      "Atomically patch tasks. Use null for unchanged text/status, parentId -1 for unchanged or 0 for root, and position -1 for unchanged.",
    parameters: UpdateTaskParams,
    prepareArguments: prepareUpdateTaskArguments,
    async execute(_toolCallId, params: UpdateTaskInput, _signal, _onUpdate, ctx) {
      try {
        const affected = state.update(params.tasks);
        notifyChange(onChange, ctx);
        return {
          content: [{ type: "text" as const, text: mutationText("Updated", affected, state) }],
          details: details("update", state, affected),
        };
      } catch (error) {
        throwToolError("Update", error);
      }
    },
    renderCall(args: UpdateTaskInput, theme: Theme) {
      return renderCall("Update Tasks", args.tasks?.length, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderToolResult(result, expanded, theme);
    },
  });

  pi.registerTool({
    name: "rm_task",
    label: "Remove Tasks",
    description:
      "Remove tasks only when mistaken, duplicate, or canceled. Removing a parent also removes its descendant subtree.",
    parameters: RemoveTaskParams,
    async execute(_toolCallId, params: RemoveTaskInput, _signal, _onUpdate, ctx) {
      try {
        const affected = state.remove(params.ids);
        notifyChange(onChange, ctx);
        return {
          content: [
            {
              type: "text" as const,
              text: `${mutationText("Removed", affected, state)} Reason: ${params.reason}.`,
            },
          ],
          details: details("remove", state, affected),
        };
      } catch (error) {
        throwToolError("Remove", error);
      }
    },
    renderCall(args: RemoveTaskInput, theme: Theme) {
      return renderCall(`Remove Tasks · ${args.reason}`, args.ids?.length, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderToolResult(result, expanded, theme);
    },
  });

  pi.registerTool({
    name: "list_task",
    label: "List Tasks",
    description: "List the full task tree compactly with id, name, and status.",
    parameters: ListTaskParams,
    async execute() {
      const affected = state.list();
      return {
        content: [{ type: "text" as const, text: formatCompactTaskTree(affected) }],
        details: details("list", state, affected),
      };
    },
    renderCall(_args, theme: Theme) {
      return renderCall("List Tasks", undefined, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderToolResult(result, expanded, theme);
    },
  });

  pi.registerTool({
    name: "get_task",
    label: "Get Tasks",
    description: "Get complete details for one or more task IDs, including parent and child IDs.",
    parameters: IdsParams,
    async execute(_toolCallId, params: IdsInput) {
      const uniqueIds = [...new Set(params.ids)];
      const affected = state.get(uniqueIds);
      const found = new Set(affected.map((task) => task.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throwToolError("Get", new TaskValidationError([`task ids do not exist: ${missing.join(", ")}`]));
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(affected) }],
        details: details("get", state, affected),
      };
    },
    renderCall(args: IdsInput, theme: Theme) {
      return renderCall("Get Tasks", args.ids?.length, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderToolResult(result, expanded, theme);
    },
  });
}
