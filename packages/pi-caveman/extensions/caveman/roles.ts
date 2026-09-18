import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Role-pack protocol identifier published by pi-herdr-agents. Registering the
 * bundled agents/ directory lets the host read and validate the definitions in
 * place instead of copying them into the user's agent config directory.
 */
export const ROLE_PACK_DISCOVERY_EVENT = "pi-herdr-subagents:roles:discover:v1";

export const PACKAGE_ROOT = (() => {
 const thisFile = fileURLToPath(import.meta.url);
 return dirname(dirname(dirname(thisFile)));
})();

export const BUNDLED_ROLES_DIR = join(PACKAGE_ROOT, "agents");

interface RolePackDiscoveryRequest {
 apiVersion: number;
 register(path: string): void;
}

export function registerCavecrewRoles(pi: ExtensionAPI): void {
 const unsubscribe = pi.events.on(ROLE_PACK_DISCOVERY_EVENT, (request) => {
  const { apiVersion, register } = request as RolePackDiscoveryRequest;
  if (apiVersion !== 1) return;
  register(BUNDLED_ROLES_DIR);
 });

 pi.on("session_shutdown", unsubscribe);
}
