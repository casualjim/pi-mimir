import net from "node:net";
import type { Task } from "./types.ts";
import { orderedTreeRows, snapshotStats } from "./ui.ts";

const SOURCE = "pi-todo-herdr";
const TASK_TOKEN = "task";
const COUNT_TOKEN = "task_count";
const PROGRESS_TOKEN = "task_progress";
let reportSeq = Date.now() * 1000;

function nextSeq(): number {
  reportSeq += 1;
  return reportSeq;
}

export function isHerdrEnvironment(): boolean {
  return process.env.HERDR_ENV === "1" && !!process.env.HERDR_SOCKET_PATH && !!process.env.HERDR_PANE_ID;
}

function hasDescendantWithStatus(task: Task, status: Task["status"], byId: Map<number, Task>): boolean {
  for (const childId of task.childrenIds) {
    const child = byId.get(childId);
    if (!child) continue;
    if (child.status === status || hasDescendantWithStatus(child, status, byId)) return true;
  }
  return false;
}

export function currentTaskTokens(tasks: Task[]): Record<string, string | null> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const stats = snapshotStats(tasks);
  const ordered = orderedTreeRows(tasks).map(({ task }) => task);
  const inProgress = ordered.filter(
    (task) => task.status === "in-progress" && !hasDescendantWithStatus(task, "in-progress", byId),
  );
  const candidates =
    inProgress.length > 0
      ? inProgress
      : ordered.filter((task) => task.status === "blocked" && !hasDescendantWithStatus(task, "blocked", byId));
  return {
    [TASK_TOKEN]: candidates.length > 0 ? `#${candidates[0]!.id} ${candidates[0]!.name}` : null,
    [COUNT_TOKEN]: candidates.length > 1 ? `+${candidates.length - 1}` : null,
    [PROGRESS_TOKEN]: stats.total > 0 && stats.done < stats.total ? `${stats.done}/${stats.total}` : null,
  };
}

export function currentTaskLabel(tasks: Task[]): string | null {
  const tokens = currentTaskTokens(tasks);
  const task = tokens[TASK_TOKEN];
  const count = tokens[COUNT_TOKEN];
  return task ? `${task}${count ? ` ${count}` : ""}` : null;
}

function sendAttempt(request: unknown, timeoutMs: number): Promise<boolean> {
  if (!isHerdrEnvironment()) return Promise.resolve(true);
  const socketPath = process.env.HERDR_SOCKET_PATH!;
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\${socketPath}` : socketPath;

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const socket = net.createConnection(endpoint);
    const finish = (delivered: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.destroy();
      resolve(delivered);
    };
    socket.on("error", () => finish(false));
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", () => finish(true));
    socket.on("end", () => finish(false));
    timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
  });
}

async function send(request: unknown): Promise<void> {
  if (await sendAttempt(request, 500)) return;
  await sendAttempt(request, 1500);
}

async function reportTokens(tokens: Record<string, string | null>): Promise<void> {
  if (!isHerdrEnvironment()) return;
  await send({
    id: `${SOURCE}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    method: "pane.report_metadata",
    params: {
      pane_id: process.env.HERDR_PANE_ID,
      source: SOURCE,
      tokens,
      seq: nextSeq(),
    },
  });
}

export function reportCurrentTask(tasks: Task[]): Promise<void> {
  return reportTokens(currentTaskTokens(tasks));
}

export function clearCurrentTask(): Promise<void> {
  return reportTokens({ [TASK_TOKEN]: null, [COUNT_TOKEN]: null, [PROGRESS_TOKEN]: null });
}
