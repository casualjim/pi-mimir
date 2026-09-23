/**
 * sandbox-guard
 *
 * Pi-facing sandbox guard adapter. Native sandbox policy construction,
 * runtime launch, and filesystem matching live under ../sandbox/.
 */

import {
 createBashToolDefinition,
 isToolCallEventType,
 type ExtensionAPI,
 type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { HeimdallConfig } from "../types.js";
import { isDenied, isWritable } from "../sandbox/filesystem-policy.js";
import { normalizeSandboxConfig } from "../sandbox/config.js";
import {
 MISSING_BINARY_MESSAGE,
 createSandboxedBashOps,
 ensureNoSandboxFlag,
 resolveHeimdallSandboxBinary,
} from "../sandbox/runtime.js";
import type { SandboxConfig, NormalizedSandboxConfig } from "../sandbox/types.js";

/**
 * Whether the host is Oh My Pi rather than Pi.
 *
 * omp injects a `zod` builder on its ExtensionAPI; Pi's API has neither `zod`
 * nor `pi`. The hosts also disagree on renderer contracts, so the entry uses
 * this to decide which host renderer to attach.
 */
export function isOmpHost(pi: ExtensionAPI): boolean {
 const candidate: unknown = pi;
 return candidate !== null && typeof candidate === "object" && "zod" in candidate && candidate.zod !== undefined;
}

/** omp's own bash transcript renderer, injected by the extension entry under omp. */
export interface OmpBashRenderer {
 renderCall: NonNullable<ToolDefinition<any, any, any>["renderCall"]>;
 renderResult: NonNullable<ToolDefinition<any, any, any>["renderResult"]>;
}

export function registerSandboxGuard(
 pi: ExtensionAPI,
 getHeimdallConfig: () => HeimdallConfig,
 getConfigPath?: () => string | undefined,
 ompBashRenderer?: OmpBashRenderer,
): void {
 let sandboxConfig: NormalizedSandboxConfig | null = null;
 /** Paths the user explicitly approved for this session via heimdall-allow, keyed "read:<abs>" / "write:<abs>". */
 const sessionAllowance = new Set<string>();
 let sandboxCwd = process.cwd();
 let sandboxBinary = resolveHeimdallSandboxBinary().binaryPath;

 ensureNoSandboxFlag(pi);

 pi.on("session_start", async (_event, ctx) => {
  sandboxCwd = ctx.cwd;
  sessionAllowance.clear();
  const noSandbox = pi.getFlag("no-sandbox") as boolean;
  if (noSandbox) {
   sandboxConfig = null;
   ctx.ui.notify("heimdall sandbox: disabled via --no-sandbox", "warning");
   return;
  }

  const config = normalizeSandboxConfig(
   getHeimdallConfig().sandbox as SandboxConfig | undefined,
   getConfigPath?.(),
  );
  const binaryResolution = resolveHeimdallSandboxBinary(config.binaryPath);
  sandboxBinary = binaryResolution.binaryPath;
  sandboxConfig = null;
  if (!config.enabled) {
   return;
  }

  if (!binaryResolution.found) {
   ctx.ui.notify(MISSING_BINARY_MESSAGE, "warning");
  }

  sandboxConfig = config;

  const writeCount = config.policy.filesystem?.writable?.length ?? 0;
  const envDenyCount = config.policy.env?.deny?.length ?? 0;
  renderSandboxStatus(ctx, writeCount, envDenyCount);
  ctx.ui.notify("heimdall sandbox: active", "info");
 });

 /** Renders the session status widget from the current sandbox config. */
 const renderSandboxStatus = (ctx: { ui: { setStatus(key: string, text: string | undefined): void; theme: { fg(color: string, value: string): string } } }, writeCount: number, envDenyCount: number): void => {
  const envIcon = envDenyCount > 0 ? `🔒${envDenyCount}` : "";
  const networkIcon = sandboxConfig!.policy.network === "host" ? "↔" : "⊘";
  const theme = ctx.ui.theme;
  ctx.ui.setStatus(
   "heimdall-sandbox",
   [
    theme.fg("accent", "🛡"),
    theme.fg("success", `✎${writeCount}`),
    theme.fg("muted", envIcon),
    theme.fg(sandboxConfig!.policy.network === "host" ? "success" : "warning", networkIcon),
   ].join(theme.fg("dim", "│")),
  );
 };

 const defaultOps = () => createSandboxedBashOps(sandboxConfig!, sandboxCwd, { binaryPath: sandboxBinary });
 const localCwd = process.cwd();
 // Definition form, not `createBashTool`: the latter wraps through
 // `wrapToolDefinition`, which drops `renderCall`/`renderResult`, so Pi would
 // lose its native bash rendering (prompt-prefixed call row, elapsed time,
 // truncation hint).
 const localBash = createBashToolDefinition(localCwd);
 const executeBash = async (
  id: string,
  params: { command: string; timeout?: number },
  signal: AbortSignal | undefined,
  onUpdate: Parameters<typeof localBash.execute>[3],
  ctx: Parameters<NonNullable<ToolDefinition<any, any, any>["execute"]>>[4],
 ) => {
  if (!sandboxConfig) {
   return localBash.execute(id, params, signal, onUpdate, ctx);
  }

  const ops = defaultOps();
  const sandboxedBash = createBashToolDefinition(sandboxCwd, { operations: ops });
  return sandboxedBash.execute(id, params, signal, onUpdate, ctx);
 };

 if (isOmpHost(pi)) {
  // omp: Pi's renderers do not work here (their contract is
  // `(args, theme, ctx)`; omp calls `(args, options, theme)`), so drop them
  // and attach the host's own result renderer. Its bash result card is the
  // merged native view (`$ cd … && <command>` plus output), so a separate
  // call card would duplicate the command. The extension ToolDefinition
  // contract cannot forward `mergeCallAndResult`, so an attached renderCall
  // always renders its own card — hence none.
  pi.registerTool({
   ...localBash,
   label: "bash (heimdall sandbox)",
   renderCall: undefined,
   renderShell: undefined,
   ...(ompBashRenderer
    ? {
     renderResult: ompBashRenderer.renderResult as unknown as ToolDefinition<any, any, any>["renderResult"],
    }
    : {}),
   execute: executeBash,
  });
 } else {
  // Pi: keep the host definition's own renderers as-is, which is what makes
  // the sandboxed tool render exactly like Pi's native bash.
  pi.registerTool({
   ...localBash,
   label: "bash (heimdall sandbox)",
   execute: executeBash,
  });
 }

 pi.on("user_bash", async (_event) => {
  if (!sandboxConfig) return undefined;

  return {
   operations: defaultOps(),
  };
 });

 pi.on("tool_call", async (event, ctx) => {
  if (!sandboxConfig) return undefined;

  const filesystem = sandboxConfig.policy.filesystem;

  const isAllowed = (operation: "read" | "write", rawPath: string) =>
   sessionAllowance.has(`${operation}:${resolve(sandboxCwd, rawPath)}`);

  const block = (operation: "read" | "write", path: string) => {
   const reason =
    `Blocked: ${event.toolName} attempted to ${operation} "${path}" denied by heimdall sandbox filesystem policy. ` +
    `Adjust .config/heimdall.json to allow this path. ` +
    (ctx.hasUI
     ? `If this access is genuinely needed, call the heimdall-allow tool with path "${path}" and operation "${operation}" plus a short justification; the user will be asked to approve it for this session.`
     : `The user can approve it for this session by running /heimdall-allow ${operation} ${path} in an interactive session.`);
   if (ctx.hasUI) ctx.ui.notify(`heimdall sandbox: blocked ${event.toolName} ${path}`, "warning");
   return { block: true as const, reason };
  };

  const input = event.input as Record<string, unknown>;
  const path = typeof input.path === "string" ? input.path : ".";

  if (isDenied(filesystem, sandboxCwd, path) && !isAllowed("read", path)) {
   return block("read", path);
  }

  if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
   if (!isWritable(filesystem, sandboxCwd, path) && !isAllowed("write", path)) {
    return block("write", path);
   }
  }

  return undefined;
 });

 /** Session-scoped approval: the agent requests, the human confirms in the UI. */
 pi.registerTool({
  name: "heimdall-allow",
  label: "Heimdall: request sandbox access",
  description:
   "Request user approval for a path blocked by the heimdall sandbox filesystem policy. " +
   "Only call this after a tool call was blocked and the access is genuinely needed; " +
   "the user gets a confirmation dialog and the approval lasts for this session only.",
  promptSnippet:
   "Ask the user to approve a heimdall sandbox-blocked path for this session (confirmation dialog).",
  promptGuidelines: [
   "Call heimdall-allow after a tool call was blocked by the heimdall sandbox and you genuinely need that path; include a one-line reason. Never use it to probe paths.",
  ],
  parameters: Type.Object({
   path: Type.String({ description: "The blocked path, as it appeared in the block message" }),
   operation: StringEnum(["read", "write"], {
    description: "Which access kind was blocked",
   }),
   reason: Type.Optional(Type.String({ description: "One line on why this access is needed" })),
  }),
  async execute(_id, params, _signal, _onUpdate, ctx) {
   if (!sandboxConfig) {
    return {
     content: [{ type: "text", text: "Heimdall sandbox is disabled; no approval needed. Retry the tool call." }],
     details: {},
    };
   }
   if (!ctx.hasUI) {
    return {
     content: [{
      type: "text",
      text: "No interactive UI in this session; the user cannot confirm here. Ask them to add the path to .config/heimdall.json instead.",
     }],
     details: {},
    };
   }
   const approved = await ctx.ui.confirm(
    "Heimdall sandbox access",
    `Allow ${params.operation} access to ${params.path} for this session?\n\n${params.reason ?? "(no reason given)"}`,
   );
   if (!approved) {
    ctx.ui.notify(`heimdall sandbox: request denied for ${params.path}`, "warning");
    return {
     content: [{ type: "text", text: "User declined this request. Do not retry; work without that path." }],
     details: {},
    };
   }
   sessionAllowance.add(`${params.operation}:${resolve(sandboxCwd, params.path)}`);
   ctx.ui.notify(`heimdall sandbox: approved ${params.operation} ${params.path} (this session)`, "info");
   return {
    content: [{
     type: "text",
     text: `Approved for this session: ${params.operation} access to ${params.path}. Retry the blocked tool call now.`,
    }],
    details: {},
   };
  },
 });

 pi.registerCommand("heimdall-allow", {
  description:
   "Approve a sandbox-blocked path for this session. Usage: /heimdall-allow <read|write> <path>",
  handler: async (args, ctx) => {
   const match = /^(read|write)\s+(\S+)\s*$/.exec(args.trim());
   const [, operation, rawPath] = match ?? [];
   if (!operation || !rawPath) {
    ctx.ui.notify("Usage: /heimdall-allow <read|write> <path>", "warning");
    return;
   }
   if (!sandboxConfig) {
    ctx.ui.notify("heimdall sandbox is disabled; nothing to allow.", "info");
    return;
   }
   sessionAllowance.add(`${operation}:${resolve(sandboxCwd, rawPath)}`);
   ctx.ui.notify(`heimdall sandbox: approved ${operation} ${rawPath} (this session)`, "info");
  },
 });

 pi.registerCommand("sandbox", {
  description: "Show heimdall sandbox configuration; /sandbox on|off toggles it for this session",
  handler: async (args, ctx) => {
   const mode = args.trim().toLowerCase();

   if (mode === "off") {
    sandboxConfig = null;
    ctx.ui.setStatus("heimdall-sandbox", undefined);
    ctx.ui.notify("heimdall sandbox: off (this session; config unchanged)", "warning");
    return;
   }

   if (mode === "on") {
    const config = normalizeSandboxConfig(
     { ...(getHeimdallConfig().sandbox as SandboxConfig | undefined), enabled: true },
     getConfigPath?.(),
    );
    sandboxConfig = config;
    renderSandboxStatus(ctx, config.policy.filesystem?.writable?.length ?? 0, config.policy.env?.deny?.length ?? 0);
    ctx.ui.notify("heimdall sandbox: on (explicit session enable; config unchanged)", "info");
    return;
   }

   if (!sandboxConfig) {
    ctx.ui.notify("heimdall sandbox: disabled", "info");
    return;
   }

   let version = "unknown";
   try {
    version = execSync(`"${sandboxBinary}" --version`, { encoding: "utf-8" }).trim();
   } catch { /* ignore */ }

   const lines = [
    "heimdall sandbox configuration:",
    "",
    `Binary: ${sandboxBinary}`,
    `Version: ${version}`,
    "Policy fragment:",
    JSON.stringify(sandboxConfig.policy, null, 2),
   ];
   ctx.ui.notify(lines.join("\n"), "info");
  },
 });
}

