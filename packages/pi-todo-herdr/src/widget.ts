import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TaskState } from "./state.ts";
import { renderProgressHeader, renderWidgetTree } from "./ui.ts";

const WIDGET_ID = "pi-todo-herdr";
const TIMER_REFRESH_MS = 1000;

export function clearTaskWidget(ctx: ExtensionContext): void {
  ctx.ui.setWidget(WIDGET_ID, undefined);
}

export function updateTaskWidget(
  state: TaskState,
  ctx: ExtensionContext,
  visible: boolean,
  refreshMs = TIMER_REFRESH_MS,
): void {
  const tasks = state.list();
  if (!visible || tasks.length === 0) {
    clearTaskWidget(ctx);
    return;
  }

  const hasActiveTimer = tasks.some((task) => task.status === "in-progress" && task.startedAt !== undefined);
  ctx.ui.setWidget(WIDGET_ID, (tui, theme) => {
    const timer = hasActiveTimer
      ? setInterval(() => tui.requestRender(), Math.max(1, refreshMs))
      : undefined;
    timer?.unref();

    return {
      render(width: number): string[] {
        const currentTasks = state.list();
        return [renderProgressHeader(state.stats(), theme, width), ...renderWidgetTree(currentTasks, theme, width)];
      },
      invalidate(): void {},
      dispose(): void {
        if (timer !== undefined) clearInterval(timer);
      },
    };
  });
}
