/**
 * heimdall integration — optional companion mode.
 *
 * When the @casualjim/pi-heimdall package is importable, every shell spawn
 * this plugin makes (bash foreground/background, bash_bg, monitor commands)
 * runs inside the heimdall sandbox with the same policy the heimdall
 * extension enforces, guarded by the same command preflight, with output
 * reads redacted by the secret-guard. When the package is absent, or the
 * sandbox is disabled via config or --no-sandbox, spawns run unsandboxed —
 * plain patty behavior.
 *
 * The heimdall package has no `exports` map, so deep imports into `lib/` are
 * the supported consumption path (the same one heimdall's own bg-tasks
 * extension uses internally).
 */

import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { HeimdallConfig } from "@casualjim/pi-heimdall/lib/types.js";
import type { NormalizedSandboxConfig } from "@casualjim/pi-heimdall/lib/sandbox/types.js";
import type { HeimdallPreflightState } from "@casualjim/pi-heimdall/lib/preflight.js";
import type { SpawnExit, SpawnResult } from "./spawn.ts";

// Module-object types for the dynamically imported heimdall modules. There is
// no value-level import to derive these from, so each is one named alias.
// ponytail: signature duplication avoided; aliases track the source modules.
type RuntimeModule = typeof import("@casualjim/pi-heimdall/lib/sandbox/runtime.js");
type ConfigModule = typeof import("@casualjim/pi-heimdall/lib/heimdall-config.js");
type PreflightModule = typeof import("@casualjim/pi-heimdall/lib/preflight.js");
type SandboxConfigModule = typeof import("@casualjim/pi-heimdall/lib/sandbox/config.js");

/**
 * Heimdall sets this when it has already registered its bash tool. Pi
 * treats the same tool name from two extensions as a fatal load conflict,
 * so when this is set we must skip our own bash registration and run with
 * the remaining tools (all of them still spawn through the sandbox).
 */
export const HEIMDALL_BASH_REGISTERED = Symbol.for("pi-heimdall.bash-registered");

export function heimdallOwnsBash(): boolean {
 return typeof (globalThis as Record<PropertyKey, unknown>)[HEIMDALL_BASH_REGISTERED] === "string";
}

/**
 * Global handshake with the heimdall extension. Pi treats the same tool
 * name from two extensions as a fatal load conflict, so ownership must be
 * exclusive. We set this AFTER our bash tool is registered; heimdall's
 * sandbox-guard then skips its own bash registration. Either load order
 * boots: us first → heimdall defers to our sandbox-aware bash; heimdall
 * first → we see HEIMDALL_BASH_REGISTERED and skip ours.
 *
 * Extension sets are fixed per process, so a stale claim cannot outlive the
 * plugin that set it.
 */
export const COMPANION_BASH = Symbol.for("pi-heimdall.companion-bash");

export function claimCompanionBash(label: string): void {
 const globals = globalThis as { [COMPANION_BASH]?: unknown };
 globals[COMPANION_BASH] = label;
}

const EMPTY_PREFLIGHT: HeimdallPreflightState = {
 secretGuard: { secretKeys: [], secretValues: {}, keyPattern: null },
};

let runtimeMod: RuntimeModule | null = null;
let configMod: ConfigModule | null = null;
let preflightMod: PreflightModule | null = null;
let sandboxConfigMod: SandboxConfigModule | null = null;

let config: HeimdallConfig | null = null;
let disabledSet = new Set<string>();
let preflightState: HeimdallPreflightState = EMPTY_PREFLIGHT;
let sandbox: NormalizedSandboxConfig | null = null;

/** Import the heimdall library once. Returns false when the package is not
 * installed — the caller falls back to unsandboxed spawns. */
export async function initHeimdall(): Promise<boolean> {
 if (runtimeMod) return true;
 // Pi's loader resolves the package's `.js` specifiers to its `.ts`
 // sources; raw Node (this repo's test runner) does not, so fall back to
 // explicit `.ts` specifiers outside the Pi host.
 for (const ext of [".js", ".ts"] as const) {
  try {
   const [runtime, config, preflight, sandboxConfig] = await Promise.all([
    import(`@casualjim/pi-heimdall/lib/sandbox/runtime${ext}`),
    import(`@casualjim/pi-heimdall/lib/heimdall-config${ext}`),
    import(`@casualjim/pi-heimdall/lib/preflight${ext}`),
    import(`@casualjim/pi-heimdall/lib/sandbox/config${ext}`),
   ]);
   runtimeMod = runtime;
   configMod = config;
   preflightMod = preflight;
   sandboxConfigMod = sandboxConfig;
   return true;
  } catch {
   runtimeMod = null;
  }
 }
 return false;
}

/**
 * Re-derive the session-scoped heimdall state, mirroring what the heimdall
 * extension does at its own session_start: effective config, disabled guard
 * set, preflight state, and the normalized sandbox config (honoring
 * --no-sandbox, which the heimdall extension owns as a flag).
 */
export async function refreshHeimdallSession(cwd: string, noSandbox: boolean): Promise<void> {
 sandbox = null;
 if (!configMod || !preflightMod || !sandboxConfigMod) return;

 const effective = configMod.loadEffectiveConfig(cwd);
 const cfg: HeimdallConfig = effective.config;
 config = cfg;
 disabledSet = new Set(Array.isArray(cfg.disabled) ? cfg.disabled : []);
 preflightState = await preflightMod.loadHeimdallPreflightState(cwd);

 if (noSandbox) return;
 const normalized = sandboxConfigMod.normalizeSandboxConfig(
  cfg.sandbox,
  effective.projectConfigPath,
 );
 if (!normalized.enabled) return;
 sandbox = normalized;
}

/** True when shell spawns must route through the heimdall sandbox. */
export function sandboxActive(): boolean {
 return sandbox !== null;
}

/**
 * The heimdall guard preflight for a shell command (command policies, secret
 * references, kubectl/sops). Runs for every sandboxed spawn — including the
 * ones made from bash_bg/monitor, whose tool names never pass through
 * heimdall's event-based guards.
 */
export function preflightCommand(command: string): string | null {
 if (!sandbox || !preflightMod) return null;
 const cfg = config;
 if (!cfg) return null;
 return preflightMod.getBackgroundCommandBlockReason(command, cfg, disabledSet, preflightState);
}

/** Secret-guard redaction for model-visible output reads. No-op without
 * heimdall or with secret-guard disabled. */
export function redactShellOutput(text: string): string {
 if (!preflightMod) return text;
 const cfg = config;
 if (!cfg) return text;
 return preflightMod.redactBackgroundOutput(text, disabledSet, preflightState);
}

/**
 * Sandbox twin of spawnWithFileOutput: launch `command` under the heimdall
 * sandbox and mirror stdout/stderr into the log files. The sandbox child is
 * detached, so killProcessTree's negative-pid group kill works unchanged.
 */
export async function spawnSandboxedWithFileOutput(args: {
 command: string;
 cwd: string;
 logPath: string;
 errPath?: string;
}): Promise<SpawnResult> {
 const activeSandbox = sandbox;
 const runtime = runtimeMod;
 if (!activeSandbox || !runtime) {
  throw new Error("heimdall sandbox is not active");
 }

 const resolution = runtime.resolveHeimdallSandboxBinary(activeSandbox.binaryPath);
 if (!resolution.found && !activeSandbox.binaryPath) {
  throw new Error(runtime.MISSING_BINARY_MESSAGE);
 }

 const { child, policyJson }: { child: ChildProcessWithoutNullStreams; policyJson: string } =
  await runtime.launchSandboxProcess(activeSandbox, args.command, {
   binaryPath: resolution.binaryPath,
   cwd: args.cwd,
   env: process.env,
  });

 mkdirSync(dirname(args.logPath), { recursive: true });
 const outFd = openSync(args.logPath, "w");
 let errFd: number;
 try {
  errFd = args.errPath ? openSync(args.errPath, "w") : outFd;
 } catch (err) {
  closeSync(outFd);
  throw err;
 }

 const write = (fd: number) => (chunk: Buffer) => {
  try {
   writeSync(fd, chunk);
  } catch {
   // A failed log write must not take the child down; the sandbox
   // supervisor keeps running and the exit path still resolves.
  }
 };
 child.stdout.on("data", write(outFd));
 child.stderr.on("data", write(errFd));
 child.stdin.end(policyJson);

 // 'exit', not 'close': same grandchild semantics as the raw spawner.
 const exit = new Promise<SpawnExit>((resolve) => {
  child.once("exit", (code: number | null, signal: NodeJS.Signals | null) =>
   resolve({ code, signal })
  );
  child.once("error", () => resolve({ code: 1, signal: null }));
 });
 void exit.finally(() => {
  closeSync(outFd);
  if (errFd !== outFd) closeSync(errFd);
 });

 return { pid: child.pid ?? 0, logPath: args.logPath, exit };
}

/** Whether the host is Oh My Pi rather than Pi (same probe heimdall uses). */
export function isOmpHost(pi: unknown): boolean {
 if (typeof pi !== "object" || pi === null || !("zod" in pi)) return false;
 const probe = pi as { zod?: unknown };
 return probe.zod !== undefined;
}
