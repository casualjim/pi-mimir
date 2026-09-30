import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PiJjRuntime } from "./runtime.js";

export function registerEvents(pi: ExtensionAPI, runtime: PiJjRuntime) {
  pi.on("session_start", async (_event, ctx) => {
    await runtime.handleSessionStart(ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    await runtime.handleBeforeAgentStart(ctx);
  });

  pi.on("turn_start", async (event) => {
    await runtime.handleTurnStart(event);
  });

  pi.on("turn_end", async (event, ctx) => {
    await runtime.handleTurnEnd(event, ctx);
  });

  pi.on("session_before_fork", async (event, ctx) => {
    return runtime.handleSessionBeforeFork(event, ctx);
  });

  pi.on("session_before_tree", async (event, ctx) => {
    return runtime.handleSessionBeforeTree(event, ctx);
  });

  // oh-my-pi (omp) forks upstream Pi and renames the fork event:
  // `session_before_fork` -> `session_before_branch`. Payload (`{ entryId }`)
  // and result contract (`cancel` / `skipConversationRestore`) are identical,
  // so register the same handler under both names; each host emits exactly one
  // of the two (upstream Pi never emits `session_before_branch`, omp never
  // emits `session_before_fork`).
  type BranchEvent = { entryId: string };
  type BranchResult = { cancel?: boolean; skipConversationRestore?: boolean };
  const onBranch = pi.on as unknown as (
    event: "session_before_branch",
    handler: (
      event: BranchEvent,
      ctx: ExtensionContext,
    ) => BranchResult | undefined | Promise<BranchResult | undefined>,
  ) => void;
  onBranch("session_before_branch", async (event, ctx) => {
    return runtime.handleSessionBeforeFork(event, ctx);
  });
}
