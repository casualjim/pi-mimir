import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  AddTaskDraft,
  Task,
  TaskPatch,
  TaskSnapshot,
  TaskStats,
  TaskStatus,
  TaskTimingSnapshot,
  TaskToolDetails,
} from "./types.ts";
import { TaskValidationError } from "./types.ts";

const MUTATION_TOOLS = new Set(["add_task", "set_tasks", "update_task", "rm_task"]);
const VALID_STATUSES = new Set<TaskStatus>(["pending", "in-progress", "blocked", "done"]);
const MAX_DATE_MS = 8_640_000_000_000_000;

interface TaskRecord {
  id: number;
  name: string;
  description?: string;
  status: TaskStatus;
  parentId: number | null;
  startedAt?: number;
  activeStartedAt?: number;
  stoppedAt?: number;
  accumulatedMs: number;
}

function cloneRecords(records: TaskRecord[]): TaskRecord[] {
  return records.map((task) => ({ ...task }));
}

function indexRecords(records: TaskRecord[]): Map<number, TaskRecord> {
  return new Map(records.map((task) => [task.id, task]));
}

function childIds(records: TaskRecord[], parentId: number | null): number[] {
  return records.filter((task) => task.parentId === parentId).map((task) => task.id);
}

function snapshotTasks(records: TaskRecord[]): Task[] {
  return records.map((task) => ({
    id: task.id,
    name: task.name,
    ...(task.description !== undefined ? { description: task.description } : {}),
    status: task.status,
    parentId: task.parentId,
    childrenIds: childIds(records, task.id),
  }));
}

function durationMs(task: TaskRecord, now: number): number {
  const activeMs = task.activeStartedAt === undefined ? 0 : Math.max(0, now - task.activeStartedAt);
  return task.accumulatedMs + activeMs;
}

function publicTasks(records: TaskRecord[], now: number): Task[] {
  const byId = indexRecords(records);
  return snapshotTasks(records).map((task) => {
    const record = byId.get(task.id);
    if (!record || record.startedAt === undefined) return task;
    return {
      ...task,
      startedAt: new Date(record.startedAt).toISOString(),
      ...(record.stoppedAt !== undefined ? { stoppedAt: new Date(record.stoppedAt).toISOString() } : {}),
      durationMs: durationMs(record, now),
    };
  });
}

function timingSnapshots(records: TaskRecord[]): TaskTimingSnapshot[] {
  const timings: TaskTimingSnapshot[] = [];
  for (const task of records) {
    if (task.startedAt === undefined) continue;
    timings.push({
      taskId: task.id,
      startedAt: task.startedAt,
      ...(task.activeStartedAt !== undefined ? { activeStartedAt: task.activeStartedAt } : {}),
      ...(task.stoppedAt !== undefined ? { stoppedAt: task.stoppedAt } : {}),
      accumulatedMs: task.accumulatedMs,
    });
  }
  return timings;
}

function startTimer(task: TaskRecord, now: number): void {
  const startedAt = Math.max(now, task.stoppedAt ?? task.startedAt ?? 0);
  task.startedAt ??= startedAt;
  task.activeStartedAt = startedAt;
  task.stoppedAt = undefined;
}

function stopTimer(task: TaskRecord, now: number): void {
  if (task.activeStartedAt === undefined) return;
  const stoppedAt = Math.max(now, task.activeStartedAt);
  task.accumulatedMs += stoppedAt - task.activeStartedAt;
  task.activeStartedAt = undefined;
  task.stoppedAt = stoppedAt;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isValidTimestamp(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value <= MAX_DATE_MS;
}

function collectDescendantIds(records: TaskRecord[], rootId: number): number[] {
  const result: number[] = [];
  const visit = (id: number) => {
    for (const childId of childIds(records, id)) {
      result.push(childId);
      visit(childId);
    }
  };
  visit(rootId);
  return result;
}

function validateGraph(records: TaskRecord[]): string[] {
  const errors: string[] = [];
  const byId = indexRecords(records);
  const ids = new Set<number>();

  for (const task of records) {
    if (!Number.isInteger(task.id) || task.id < 1) errors.push(`task ${task.id}: id must be a positive integer`);
    if (ids.has(task.id)) errors.push(`task ${task.id}: duplicate id`);
    ids.add(task.id);
    if (!task.name.trim()) errors.push(`task ${task.id}: name must not be empty`);
    if (/[\r\n]/.test(task.name)) errors.push(`task ${task.id}: name must be a single line`);
    if (task.description !== undefined && !task.description.trim()) {
      errors.push(`task ${task.id}: description must not be empty`);
    }
    if (!VALID_STATUSES.has(task.status)) errors.push(`task ${task.id}: invalid status '${task.status}'`);
    if (!isNonNegativeSafeInteger(task.accumulatedMs)) {
      errors.push(`task ${task.id}: accumulatedMs must be a non-negative safe integer`);
    }
    if (task.startedAt === undefined) {
      if (task.activeStartedAt !== undefined || task.stoppedAt !== undefined || task.accumulatedMs !== 0) {
        errors.push(`task ${task.id}: timer fields require startedAt`);
      }
      if (task.status === "in-progress") errors.push(`task ${task.id}: in-progress task is missing timer data`);
    } else {
      if (!isValidTimestamp(task.startedAt)) {
        errors.push(`task ${task.id}: startedAt must be a valid non-negative timestamp`);
      }
      if (task.activeStartedAt !== undefined && !isValidTimestamp(task.activeStartedAt)) {
        errors.push(`task ${task.id}: activeStartedAt must be a valid non-negative timestamp`);
      }
      if (task.stoppedAt !== undefined && !isValidTimestamp(task.stoppedAt)) {
        errors.push(`task ${task.id}: stoppedAt must be a valid non-negative timestamp`);
      }
      if (task.activeStartedAt !== undefined && task.activeStartedAt < task.startedAt) {
        errors.push(`task ${task.id}: activeStartedAt must not precede startedAt`);
      }
      if (task.stoppedAt !== undefined && task.stoppedAt < task.startedAt) {
        errors.push(`task ${task.id}: stoppedAt must not precede startedAt`);
      }
      if (task.status === "in-progress") {
        if (task.activeStartedAt === undefined) errors.push(`task ${task.id}: active timer is missing its segment start`);
        if (task.stoppedAt !== undefined) errors.push(`task ${task.id}: active timer must not have stoppedAt`);
      } else {
        if (task.activeStartedAt !== undefined) errors.push(`task ${task.id}: inactive task has an active timer segment`);
        if (task.stoppedAt === undefined) errors.push(`task ${task.id}: paused timer is missing stoppedAt`);
      }
    }
    if (task.parentId !== null && !byId.has(task.parentId)) {
      errors.push(`task ${task.id}: parent ${task.parentId} does not exist`);
    }
  }

  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (id: number): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const parentId = byId.get(id)?.parentId;
    if (parentId !== null && parentId !== undefined && visit(parentId)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const task of records) {
    if (visit(task.id)) {
      errors.push(`task ${task.id}: parentId creates a cycle`);
      break;
    }
  }

  if (errors.length > 0) return errors;

  for (const task of records) {
    if (task.status !== "done") continue;
    const unfinished = collectDescendantIds(records, task.id).filter((id) => byId.get(id)?.status !== "done");
    if (unfinished.length > 0) {
      errors.push(`task ${task.id}: done task has unfinished descendants ${unfinished.join(", ")}`);
    }
  }

  return errors;
}

function insertAtSiblingPosition(records: TaskRecord[], id: number, position: number): string | undefined {
  const byId = indexRecords(records);
  const task = byId.get(id);
  if (!task) return `task ${id}: does not exist`;

  const siblings = childIds(records, task.parentId).filter((siblingId) => siblingId !== id);
  if (!Number.isInteger(position) || position < 0 || position > siblings.length) {
    return `task ${id}: position must be between 0 and ${siblings.length}`;
  }

  const recordIndex = records.findIndex((record) => record.id === id);
  const [record] = records.splice(recordIndex, 1);
  if (!record) return `task ${id}: does not exist`;

  if (position < siblings.length) {
    const targetIndex = records.findIndex((candidate) => candidate.id === siblings[position]);
    records.splice(targetIndex, 0, record);
    return;
  }

  if (siblings.length === 0) {
    records.push(record);
    return;
  }

  const lastSiblingIndex = records.findIndex((candidate) => candidate.id === siblings[siblings.length - 1]);
  records.splice(lastSiblingIndex + 1, 0, record);
}

function moveToSiblingEnd(records: TaskRecord[], id: number): void {
  const task = records.find((candidate) => candidate.id === id);
  if (!task) return;
  const siblings = childIds(records, task.parentId).filter((siblingId) => siblingId !== id);
  const currentIndex = records.findIndex((candidate) => candidate.id === id);
  const [record] = records.splice(currentIndex, 1);
  if (!record) return;
  if (siblings.length === 0) {
    records.push(record);
    return;
  }
  const lastSiblingIndex = records.findIndex((candidate) => candidate.id === siblings[siblings.length - 1]);
  records.splice(lastSiblingIndex + 1, 0, record);
}

export class TaskState {
  private records: TaskRecord[] = [];
  private nextId = 1;

  constructor(private readonly now: () => number = Date.now) {}

  private currentTime(): number {
    const now = Math.floor(this.now());
    if (!isValidTimestamp(now)) throw new Error("task clock must return a valid non-negative timestamp");
    return now;
  }

  list(): Task[] {
    const now = this.records.some((task) => task.startedAt !== undefined) ? this.currentTime() : 0;
    return publicTasks(this.records, now);
  }

  get(ids: number[]): Task[] {
    const byId = new Map(this.list().map((task) => [task.id, task]));
    return ids.map((id) => byId.get(id)).filter((task): task is Task => task !== undefined);
  }

  snapshot(): TaskSnapshot {
    const timings = timingSnapshots(this.records);
    return {
      tasks: snapshotTasks(this.records),
      nextId: this.nextId,
      ...(timings.length > 0 ? { timings } : {}),
    };
  }

  stats(): TaskStats {
    const tasks = this.records;
    return {
      total: tasks.length,
      pending: tasks.filter((task) => task.status === "pending").length,
      inProgress: tasks.filter((task) => task.status === "in-progress").length,
      blocked: tasks.filter((task) => task.status === "blocked").length,
      done: tasks.filter((task) => task.status === "done").length,
    };
  }

  add(drafts: AddTaskDraft[]): Task[] {
    const errors: string[] = [];
    if (!Array.isArray(drafts) || drafts.length === 0) throw new TaskValidationError(["tasks must not be empty"]);

    const working = cloneRecords(this.records);
    const existingIds = new Set(working.map((task) => task.id));
    const now = this.currentTime();
    let nextId = this.nextId;
    const addedIds: number[] = [];

    const append = (draft: AddTaskDraft, implicitParentId: number | null, path: string, nested: boolean) => {
      if (!draft || typeof draft !== "object") {
        errors.push(`${path}: task must be an object`);
        return;
      }
      if (typeof draft.name !== "string" || !draft.name.trim()) errors.push(`${path}.name must not be empty`);
      if (typeof draft.name === "string" && /[\r\n]/.test(draft.name)) errors.push(`${path}.name must be a single line`);
      if (
        draft.description !== undefined &&
        draft.description !== null &&
        (typeof draft.description !== "string" || !draft.description.trim())
      ) {
        errors.push(`${path}.description must not be empty`);
      }
      if (draft.status !== undefined && draft.status !== null && !VALID_STATUSES.has(draft.status)) {
        errors.push(`${path}.status is invalid`);
      }
      if (nested && draft.parentId !== undefined && draft.parentId !== null) {
        errors.push(`${path}.parentId is not allowed inside children`);
      }
      if (draft.children !== undefined && !Array.isArray(draft.children)) errors.push(`${path}.children must be an array`);

      let parentId = implicitParentId;
      if (!nested && draft.parentId !== undefined && draft.parentId !== null) {
        if (!Number.isInteger(draft.parentId) || !existingIds.has(draft.parentId)) {
          errors.push(`${path}.parentId ${draft.parentId} does not exist`);
        } else {
          parentId = draft.parentId;
        }
      }

      const id = nextId++;
      const status = draft.status ?? "pending";
      addedIds.push(id);
      working.push({
        id,
        name: typeof draft.name === "string" ? draft.name.trim() : "",
        ...(typeof draft.description === "string" ? { description: draft.description.trim() } : {}),
        status,
        parentId,
        accumulatedMs: 0,
        ...(status === "in-progress" ? { startedAt: now, activeStartedAt: now } : {}),
      });

      const children = Array.isArray(draft.children) ? draft.children : [];
      for (const [index, child] of children.entries()) {
        append(child, id, `${path}.children[${index}]`, true);
      }
    };

    drafts.forEach((draft, index) => append(draft, null, `tasks[${index}]`, false));
    errors.push(...validateGraph(working));
    if (errors.length > 0) throw new TaskValidationError([...new Set(errors)]);

    this.records = working;
    this.nextId = nextId;
    return this.get(addedIds);
  }

  set(mode: "append" | "replace", drafts: AddTaskDraft[], force?: boolean): Task[] {
    if (mode === "append") {
      if (force === true) throw new TaskValidationError(["force must be false in append mode"]);
      return this.add(drafts);
    }
    if (mode !== "replace") throw new TaskValidationError(["mode must be append or replace"]);
    if (!Array.isArray(drafts)) throw new TaskValidationError(["tasks must be an array"]);

    const errors: string[] = [];
    if (this.records.some((task) => task.status !== "done") && force !== true) {
      errors.push("replace requires force when unfinished tasks exist");
    }
    drafts.forEach((draft, index) => {
      if (draft?.parentId !== undefined && draft.parentId !== null) {
        errors.push(`tasks[${index}].parentId is not allowed in replace mode`);
      }
    });
    if (errors.length > 0) throw new TaskValidationError(errors);

    const replacement = new TaskState(this.now);
    const affected = drafts.length === 0 ? [] : replacement.add(drafts);
    this.restore(replacement.snapshot());
    return affected;
  }

  update(patches: TaskPatch[]): Task[] {
    const errors: string[] = [];
    if (!Array.isArray(patches) || patches.length === 0) throw new TaskValidationError(["tasks must not be empty"]);

    const duplicateIds = patches
      .map((patch) => patch.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) errors.push(`duplicate task patches: ${[...new Set(duplicateIds)].join(", ")}`);

    const working = cloneRecords(this.records);
    const now = this.currentTime();
    for (const [index, patch] of patches.entries()) {
      const path = `tasks[${index}]`;
      const task = working.find((candidate) => candidate.id === patch.id);
      if (!task) {
        errors.push(`${path}.id ${patch.id} does not exist`);
        continue;
      }

      const hasNameChange = patch.name !== undefined && patch.name !== null;
      const hasDescriptionChange = patch.description !== undefined && patch.description !== null;
      const hasStatusChange = patch.status !== undefined && patch.status !== null;
      const hasParentChange = patch.parentId !== undefined && patch.parentId !== -1;
      const hasPositionChange = patch.position !== undefined && patch.position !== null && patch.position !== -1;
      if (!hasNameChange && !hasDescriptionChange && !hasStatusChange && !hasParentChange && !hasPositionChange) {
        errors.push(`${path} must include at least one field to update`);
      }
      if (hasNameChange && (typeof patch.name !== "string" || !patch.name.trim())) {
        errors.push(`${path}.name must not be empty`);
      }
      if (typeof patch.name === "string" && /[\r\n]/.test(patch.name)) errors.push(`${path}.name must be a single line`);
      if (hasDescriptionChange && (typeof patch.description !== "string" || !patch.description.trim())) {
        errors.push(`${path}.description must not be empty`);
      }
      if (hasStatusChange && !VALID_STATUSES.has(patch.status as TaskStatus)) errors.push(`${path}.status is invalid`);
      if (
        hasParentChange &&
        patch.parentId !== null &&
        patch.parentId !== 0 &&
        (!Number.isInteger(patch.parentId) || !working.some((candidate) => candidate.id === patch.parentId))
      ) {
        errors.push(`${path}.parentId ${patch.parentId} does not exist`);
      }

      if (patch.name !== undefined && patch.name !== null) task.name = patch.name.trim();
      if (patch.description !== undefined && patch.description !== null) task.description = patch.description.trim();
      if (patch.status !== undefined && patch.status !== null && patch.status !== task.status) {
        if (task.status === "in-progress" && patch.status !== "in-progress") stopTimer(task, now);
        if (task.status !== "in-progress" && patch.status === "in-progress") startTimer(task, now);
        task.status = patch.status;
      }
      if (
        patch.parentId !== undefined &&
        patch.parentId !== -1 &&
        (patch.parentId === null ||
          patch.parentId === 0 ||
          working.some((item) => item.id === patch.parentId))
      ) {
        task.parentId = patch.parentId === 0 ? null : patch.parentId;
        moveToSiblingEnd(working, task.id);
      }
      if (patch.position !== undefined && patch.position !== null && patch.position !== -1) {
        const positionError = insertAtSiblingPosition(working, task.id, patch.position);
        if (positionError) errors.push(`${path}.position: ${positionError}`);
      }
    }

    errors.push(...validateGraph(working));
    if (errors.length > 0) throw new TaskValidationError([...new Set(errors)]);

    this.records = working;
    return this.get(patches.map((patch) => patch.id));
  }

  remove(ids: number[]): Task[] {
    if (!Array.isArray(ids) || ids.length === 0) throw new TaskValidationError(["ids must not be empty"]);
    const uniqueIds = [...new Set(ids)];
    const missing = uniqueIds.filter((id) => !this.records.some((task) => task.id === id));
    if (missing.length > 0) throw new TaskValidationError([`task ids do not exist: ${missing.join(", ")}`]);

    const removedIds = new Set<number>();
    for (const id of uniqueIds) {
      removedIds.add(id);
      for (const descendantId of collectDescendantIds(this.records, id)) removedIds.add(descendantId);
    }
    const now = this.currentTime();
    for (const task of this.records) {
      if (removedIds.has(task.id) && task.status === "in-progress") stopTimer(task, now);
    }
    const removed = publicTasks(this.records, now).filter((task) => removedIds.has(task.id));
    this.records = this.records.filter((task) => !removedIds.has(task.id));
    return removed;
  }

  restore(snapshot: TaskSnapshot): void {
    if (!snapshot || !Array.isArray(snapshot.tasks) || !Number.isInteger(snapshot.nextId)) {
      throw new TaskValidationError(["invalid task snapshot"]);
    }
    if (snapshot.timings !== undefined && !Array.isArray(snapshot.timings)) {
      throw new TaskValidationError(["invalid task snapshot timings"]);
    }

    const records = snapshot.tasks.map(({ id, name, description, status, parentId }) => ({
      id,
      name,
      description,
      status,
      parentId,
      accumulatedMs: 0,
    }));
    const byId = indexRecords(records);
    const timingErrors: string[] = [];
    const timedIds = new Set<number>();

    for (const [index, timing] of (snapshot.timings ?? []).entries()) {
      const path = `timings[${index}]`;
      if (!timing || typeof timing !== "object") {
        timingErrors.push(`${path} must be an object`);
        continue;
      }
      if (!Number.isInteger(timing.taskId) || timing.taskId < 1) {
        timingErrors.push(`${path}.taskId must be a positive integer`);
        continue;
      }
      if (timedIds.has(timing.taskId)) {
        timingErrors.push(`${path}.taskId ${timing.taskId} is duplicated`);
        continue;
      }
      timedIds.add(timing.taskId);
      const task = byId.get(timing.taskId);
      if (!task) {
        timingErrors.push(`${path}.taskId ${timing.taskId} does not exist`);
        continue;
      }
      task.startedAt = timing.startedAt;
      task.activeStartedAt = timing.activeStartedAt;
      task.stoppedAt = timing.stoppedAt;
      task.accumulatedMs = timing.accumulatedMs;
    }

    if (timingErrors.length > 0) throw new TaskValidationError(timingErrors);
    if (snapshot.timings === undefined && records.some((task) => task.status === "in-progress")) {
      const now = this.currentTime();
      for (const task of records) {
        if (task.status === "in-progress") startTimer(task, now);
      }
    }

    const errors = validateGraph(records);
    const maxId = records.reduce((max, task) => Math.max(max, task.id), 0);
    if (snapshot.nextId <= maxId) errors.push(`nextId must be greater than ${maxId}`);
    if (errors.length > 0) throw new TaskValidationError(errors);
    this.records = cloneRecords(records);
    this.nextId = snapshot.nextId;
  }

  loadFromSession(ctx: ExtensionContext): void {
    this.records = [];
    this.nextId = 1;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const message = entry.message;
      if (message.role !== "toolResult" || !MUTATION_TOOLS.has(message.toolName)) continue;
      const details = message.details as TaskToolDetails | undefined;
      if (!details?.snapshot) continue;
      try {
        this.restore(details.snapshot);
      } catch {
        // Ignore corrupt historical snapshots and keep the latest valid state.
      }
    }
  }
}
