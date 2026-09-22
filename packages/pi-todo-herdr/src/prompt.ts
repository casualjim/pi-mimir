import type { Task } from "./types.ts";
import { orderedTreeRows } from "./ui.ts";

export const COMPACTION_REMINDER_TYPE = "pi-todo-herdr-compaction";
export const COMPACTION_REMINDER =
  "Active tasks exist. Call list_task now; treat its result as authoritative.";

export const TASK_PROMPT_GUIDELINES = [
  "For work with 3+ distinct steps, explore enough to understand the scope, then call set_tasks before implementation; otherwise skip tracking. Start one task in-progress.",
  "Use update_task when tasks start, block, or finish; keep statuses accurate before the final response.",
];

export function formatCompactTaskTree(tasks: Task[]): string {
  if (tasks.length === 0) return "No tasks.";
  return orderedTreeRows(tasks)
    .map(({ task, prefix }) => `${prefix}${task.id} [${task.status}] ${task.name}`)
    .join("\n");
}

export function hasUnfinishedTasks(tasks: Task[]): boolean {
  return tasks.some((task) => task.status !== "done");
}
