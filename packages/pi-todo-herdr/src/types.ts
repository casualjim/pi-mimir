export type TaskStatus = "pending" | "in-progress" | "blocked" | "done";

export interface Task {
  id: number;
  name: string;
  description?: string;
  status: TaskStatus;
  parentId: number | null;
  childrenIds: number[];
  startedAt?: string;
  stoppedAt?: string;
  durationMs?: number;
}

export interface TaskTimingSnapshot {
  taskId: number;
  startedAt: number;
  activeStartedAt?: number;
  stoppedAt?: number;
  accumulatedMs: number;
}

export interface TaskSnapshot {
  tasks: Task[];
  nextId: number;
  timings?: TaskTimingSnapshot[];
}

export interface AddTaskDraft {
  name: string;
  description?: string | null;
  status?: TaskStatus | null;
  parentId?: number | null;
  children?: AddTaskDraft[];
}

export interface TaskPatch {
  id: number;
  name?: string | null;
  description?: string | null;
  status?: TaskStatus | null;
  parentId?: number | null;
  position?: number | null;
}

export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  blocked: number;
  done: number;
}

export interface TaskToolDetails {
  action: "add" | "append" | "replace" | "update" | "remove" | "list" | "get";
  snapshot: TaskSnapshot;
  affected: Task[];
  errors?: string[];
}

export class TaskValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join("\n"));
    this.name = "TaskValidationError";
    this.errors = errors;
  }
}
