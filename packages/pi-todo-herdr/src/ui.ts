import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Task, TaskStats, TaskToolDetails } from "./types.ts";

export const STATUS_ICONS = {
  pending: "○",
  "in-progress": "◉",
  blocked: "!",
  done: "✓",
} as const;

interface DescendantStats {
  done: number;
  total: number;
}

interface TreeRow {
  task: Task;
  prefix: string;
  collapsed?: DescendantStats;
}

function descendantStats(task: Task, byId: Map<number, Task>, memo: Map<number, DescendantStats>): DescendantStats {
  const cached = memo.get(task.id);
  if (cached) return cached;

  let done = 0;
  let total = 0;
  for (const childId of task.childrenIds) {
    const child = byId.get(childId);
    if (!child) continue;

    total += 1;
    if (child.status === "done") done += 1;
    const nested = descendantStats(child, byId, memo);
    done += nested.done;
    total += nested.total;
  }

  const stats = { done, total };
  memo.set(task.id, stats);
  return stats;
}

function buildTreeRows(tasks: Task[], collapseCompleted: boolean): TreeRow[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const memo = new Map<number, DescendantStats>();
  const rows: TreeRow[] = [];

  const visit = (task: Task, ancestorHasNext: boolean[], isLast: boolean, depth: number) => {
    const ancestors = ancestorHasNext.map((hasNext) => (hasNext ? "│  " : "   ")).join("");
    const connector = depth === 0 ? "" : isLast ? "└─ " : "├─ ";
    const stats = collapseCompleted ? descendantStats(task, byId, memo) : undefined;
    const collapsed = stats && stats.total > 0 && stats.done === stats.total ? stats : undefined;
    rows.push({ task, prefix: `${ancestors}${connector}`, ...(collapsed ? { collapsed } : {}) });
    if (collapsed) return;

    const children = task.childrenIds.map((id) => byId.get(id)).filter((child): child is Task => child !== undefined);
    children.forEach((child, index) => {
      const childAncestors = depth === 0 ? [] : [...ancestorHasNext, !isLast];
      visit(child, childAncestors, index === children.length - 1, depth + 1);
    });
  };

  const roots = tasks.filter((task) => task.parentId === null);
  roots.forEach((root, index) => visit(root, [], index === roots.length - 1, 0));
  return rows;
}

export function orderedTreeRows(tasks: Task[]): TreeRow[] {
  return buildTreeRows(tasks, false);
}

function styleTaskName(task: Task, theme: Theme): string {
  if (task.status === "done") return theme.fg("dim", theme.strikethrough(task.name));
  if (task.status === "in-progress") return theme.fg("warning", task.name);
  return task.name;
}

function styleStatusIcon(task: Task, theme: Theme): string {
  const icon = STATUS_ICONS[task.status];
  if (task.status === "done") return theme.fg("success", icon);
  if (task.status === "in-progress") return theme.fg("warning", icon);
  if (task.status === "blocked") return theme.fg("error", icon);
  return theme.fg("dim", icon);
}

export function formatDuration(durationMs: number): string {
  const safeMs = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const minuteClock = [minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  return hours === 0 ? minuteClock : `${String(hours).padStart(2, "0")}:${minuteClock}`;
}

function renderTaskLineWithSuffix(
  task: Task,
  prefix: string,
  theme: Theme,
  width: number,
  suffix?: string,
): string {
  const line =
    theme.fg("dim", prefix) +
    styleStatusIcon(task, theme) +
    " " +
    theme.fg("accent", `${task.id}.`) +
    " " +
    styleTaskName(task, theme);
  const trailing = [
    suffix === undefined ? undefined : theme.fg("dim", ` · ${suffix}`),
    task.durationMs === undefined ? undefined : theme.fg("dim", ` · ${formatDuration(task.durationMs)}`),
  ]
    .filter((part): part is string => part !== undefined)
    .join("");
  if (trailing.length === 0) return truncateToWidth(line, Math.max(1, width));

  const trailingWidth = visibleWidth(trailing);
  const minimumTaskWidth = suffix === undefined ? 6 : 12;
  if (width <= trailingWidth + minimumTaskWidth) return truncateToWidth(line, Math.max(1, width));
  const taskWidth = Math.max(1, width - trailingWidth);
  return truncateToWidth(line, taskWidth) + trailing;
}

export function renderTaskLine(task: Task, prefix: string, theme: Theme, width: number): string {
  return renderTaskLineWithSuffix(task, prefix, theme, width);
}

export function renderTree(tasks: Task[], theme: Theme, width: number, padding = "  "): string[] {
  return orderedTreeRows(tasks).map(({ task, prefix }) => renderTaskLine(task, `${padding}${prefix}`, theme, width));
}

export function renderWidgetTree(tasks: Task[], theme: Theme, width: number, padding = "  "): string[] {
  return buildTreeRows(tasks, true).map(({ task, prefix, collapsed }) => {
    const summary = collapsed === undefined ? undefined : `${collapsed.done}/${collapsed.total} done`;
    return renderTaskLineWithSuffix(task, `${padding}${prefix}`, theme, width, summary);
  });
}

export function progressLabel(stats: TaskStats): string {
  const blocked = stats.blocked > 0 ? ` · !${stats.blocked}` : "";
  return ` Tasks ${stats.done}/${stats.total}${blocked}`;
}

export function renderProgressHeader(stats: TaskStats, theme: Theme, width: number): string {
  const label = progressLabel(stats);
  const available = width - visibleWidth(label) - 2;
  if (available < 5) return truncateToWidth(theme.fg("accent", label), Math.max(1, width));

  const barWidth = Math.min(20, available);
  const filled = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * barWidth);
  const filledColor = stats.done === stats.total ? "success" : "accent";
  const bar =
    theme.fg(filledColor, theme.bold("━".repeat(filled))) + theme.fg("dim", "─".repeat(barWidth - filled));
  return truncateToWidth(`${theme.fg("accent", label)}  ${bar}`, Math.max(1, width));
}

class TaskResultComponent implements Component {
  constructor(
    private readonly build: (width: number) => string[],
  ) {}

  render(width: number): string[] {
    return this.build(Math.max(1, width)).map((line) => truncateToWidth(line, Math.max(1, width)));
  }

  invalidate(): void {}
}

function firstText(content: Array<{ type: string; text?: string }>): string {
  return content.find((item) => item.type === "text")?.text ?? "";
}

function summaryFor(details: TaskToolDetails): string {
  const stats = snapshotStats(details.snapshot.tasks);
  const progress = `${stats.done}/${stats.total} done`;
  switch (details.action) {
    case "add":
    case "append":
      return `${details.affected.length} added · ${progress}`;
    case "replace":
      return stats.total === 0 ? "task tree cleared" : `${stats.total} installed · ${progress}`;
    case "update":
      return `${details.affected.length} updated · ${progress}`;
    case "remove":
      return `${details.affected.length} removed · ${progress}`;
    case "list":
      return `${stats.total} task${stats.total === 1 ? "" : "s"} · ${progress}`;
    case "get":
      return `${details.affected.length} task${details.affected.length === 1 ? "" : "s"}`;
  }
}

export function snapshotStats(tasks: Task[]): TaskStats {
  return {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "pending").length,
    inProgress: tasks.filter((task) => task.status === "in-progress").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    done: tasks.filter((task) => task.status === "done").length,
  };
}

function renderFlatTasks(tasks: Task[], theme: Theme, width: number): string[] {
  return tasks.map((task) => renderTaskLine(task, "  ", theme, width));
}

function renderTaskDetails(tasks: Task[], theme: Theme, width: number): string[] {
  const lines: string[] = [];
  for (const [index, task] of tasks.entries()) {
    if (index > 0) lines.push("");
    lines.push(renderTaskLine(task, "  ", theme, width));
    const parent = task.parentId === null ? "root" : `#${task.parentId}`;
    const children = task.childrenIds.length === 0 ? "none" : task.childrenIds.map((id) => `#${id}`).join(", ");
    lines.push(truncateToWidth(theme.fg("dim", `    Parent ${parent} · Children ${children}`), width));
    if (task.description) {
      const prefix = "    ";
      const descriptionWidth = Math.max(1, width - visibleWidth(prefix));
      for (const sourceLine of task.description.split("\n")) {
        const wrapped = wrapTextWithAnsi(theme.fg("muted", sourceLine), descriptionWidth);
        if (wrapped.length === 0) lines.push(prefix);
        else lines.push(...wrapped.map((line) => `${prefix}${line}`));
      }
    }
  }
  return lines;
}

function isValidTaskToolDetails(details: unknown): details is TaskToolDetails {
  if (!details || typeof details !== "object") return false;
  const d = details as Partial<TaskToolDetails>;
  return (
    typeof d.action === "string" &&
    Array.isArray(d.snapshot?.tasks) &&
    Array.isArray(d.affected)
  );
}

export function renderToolResult(
  result: { content: Array<{ type: string; text?: string }>; details?: unknown; isError?: boolean },
  expanded: boolean,
  theme: Theme,
): Component {
  const raw = firstText(result.content);
  const details = result.details as TaskToolDetails | undefined;

  if (result.isError || !isValidTaskToolDetails(details)) {
    const rawLines = raw.split("\n").filter(Boolean);
    return new TaskResultComponent((width) => {
      const lines = expanded ? rawLines : rawLines.slice(0, 1);
      return lines.map((line, index) => theme.fg("error", `${index === 0 ? "✗ " : "  "}${line}`));
    });
  }

  return new TaskResultComponent((width) => {
    const lines = [theme.fg("success", "✓ ") + theme.fg("muted", summaryFor(details))];
    if (!expanded || details.affected.length === 0) return lines;
    if (details.action === "list") return [...lines, ...renderTree(details.affected, theme, width)];
    if (details.action === "get") return [...lines, ...renderTaskDetails(details.affected, theme, width)];
    return [...lines, ...renderFlatTasks(details.affected, theme, width)];
  });
}
