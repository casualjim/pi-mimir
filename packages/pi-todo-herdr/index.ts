import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { clearCurrentTask, reportCurrentTask } from "./src/herdr.ts";
import {
  COMPACTION_REMINDER,
  COMPACTION_REMINDER_TYPE,
  hasUnfinishedTasks,
} from "./src/prompt.ts";
import { TaskState } from "./src/state.ts";
import { registerTaskTools } from "./src/tools.ts";
import { clearTaskWidget, updateTaskWidget } from "./src/widget.ts";

export default function piTodoHerdr(pi: ExtensionAPI): void {
  const state = new TaskState();
  let widgetVisible = true;

  const refresh = (ctx: ExtensionContext) => {
    updateTaskWidget(state, ctx, widgetVisible);
    void reportCurrentTask(state.list());
  };

  const restore = (ctx: ExtensionContext) => {
    state.loadFromSession(ctx);
    refresh(ctx);
  };

  pi.on("session_start", async (_event, ctx) => restore(ctx));
  pi.on("session_tree", async (_event, ctx) => restore(ctx));
  pi.on("session_shutdown", async (event) => {
    if (event.reason === "quit") await clearCurrentTask();
  });
  pi.on("session_compact", () => {
    if (!hasUnfinishedTasks(state.list())) return;
    pi.sendMessage(
      {
        customType: COMPACTION_REMINDER_TYPE,
        content: COMPACTION_REMINDER,
        display: false,
      },
      { deliverAs: "steer" },
    );
  });

  registerTaskTools(pi, state, refresh);

  pi.registerCommand("tasks", {
    description: "Show or hide the task tree widget",
    handler: async (_args, ctx) => {
      if (state.list().length === 0) {
        clearTaskWidget(ctx);
        ctx.ui.notify("No tasks yet.", "info");
        return;
      }

      widgetVisible = !widgetVisible;
      if (widgetVisible) {
        updateTaskWidget(state, ctx, true);
        ctx.ui.notify("Task widget shown.", "info");
      } else {
        clearTaskWidget(ctx);
        ctx.ui.notify("Task widget hidden.", "info");
      }
    },
  });
}
