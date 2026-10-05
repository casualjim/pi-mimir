import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Host runtime this extension is loaded into. */
export type PstackHost = "omp" | "pi";

/**
 * omp's ExtensionAPI exposes `zod`; pi's does not. Mirrors pi-headroom's
 * detectHeadroomHost so settings location is the only host difference.
 */
export function detectPstackHost(api: unknown): PstackHost {
 if (typeof api !== "object" || api === null || !("zod" in api)) return "pi";
 return typeof api.zod !== "undefined" ? "omp" : "pi";
}

function expandHome(raw: string): string {
 return raw.replace(/^~(?=\/|$)/, homedir());
}

/**
 * Resolve the pstack config file for a host.
 * `PI_CODING_AGENT_DIR` (omp + pi honour it) → host agent dir
 * (`~/.omp/agent` for omp, `~/.pi/agent` for pi).
 */
export function resolvePstackConfigFile(host: PstackHost, env: NodeJS.ProcessEnv = process.env): string {
 const agentDir = env.PI_CODING_AGENT_DIR?.trim();
 if (agentDir) return join(expandHome(agentDir), "pstack", "config.json");
 const agentRoot = host === "omp" ? join(homedir(), ".omp", "agent") : join(homedir(), ".pi", "agent");
 return join(agentRoot, "pstack", "config.json");
}

/**
 * Load `confirmExternalActions` from the pstack config. Only an explicit
 * boolean `false` disables the external-action confirmation guard; a missing,
 * malformed, or otherwise-typed config keeps the guard enabled.
 */
export function confirmExternalActionsEnabled(configFile: string): boolean {
 let config: Record<string, unknown> | null = null;
 try {
  config = JSON.parse(readFileSync(configFile, "utf8")) as Record<string, unknown>;
 } catch {
  return true;
 }
 return config?.confirmExternalActions !== false;
}
