/**
 * heimdall — guardian extension for pi
 *
 * A single extension that provides multiple security guards:
 *   - secret-guard: blocks secret key references in bash, redacts values from output
 *   - command-policy-guard: enforces repo command policies from heimdall config
 *   - env-protect: blocks read tool calls targeting .env files
 *   - kubectl-secret-guard: blocks risky kubectl commands (get secrets, patch finalizers, exec)
 *   - sops-secret-guard: blocks sops decrypt invocations
 *   - sandbox-guard: native sandbox delegation via heimdall-sandbox (always-on)
 *
 * Config is loaded from three levels and deep-merged (later levels override earlier levels):
 *   - Generated defaults: ~/.config/heimdall/default.jsonc
 *   - User-level:        ~/.config/heimdall/config.jsonc (fallback: .json)
 *   - Project-level:     repo root `.config/heimdall.json` (fallback: .json)
 *
 * sandbox-guard always runs (when enabled in config).
 * The following guards can be disabled via the `disabled` array:
 *   - secret-guard, command-policy-guard, env-protect,
 *   - kubectl-secret-guard, sops-secret-guard
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { HeimdallConfig } from "../lib/types.js";
import {
 OPT_OUT_GUARD_IDS,
 ensureGeneratedDefaultConfig,
 loadEffectiveConfig,
} from "../lib/heimdall-config.js";

import { registerSecretGuard } from "../lib/guards/secret-guard.js";
import { registerCommandPolicyGuard } from "../lib/guards/command-policy-guard.js";
import { registerEnvProtect } from "../lib/guards/env-protect.js";
import { registerKubectlSecretGuard } from "../lib/guards/kubectl-secret-guard.js";
import { registerSopsSecretGuard } from "../lib/guards/sops-secret-guard.js";
import { registerFnoxSecretGuard } from "../lib/guards/fnox-secret-guard.js";
import {
 registerSandboxGuard,
 isOmpHost,
 type OmpBashRenderer,
} from "../lib/guards/sandbox-guard.js";

async function loadOmpBashRenderer(): Promise<OmpBashRenderer | undefined> {
 // omp-only subpath: under omp `@earendil-works/pi-tui` remaps to the bundled
 // `@oh-my-pi/pi-tui`, which exports `toolRenderers.bash` — the host's own
 // bash transcript renderer. Pi's published pi-tui has no `./tools` subpath,
 // so a static import fails the Pi host; this is why dynamic is required.
 try {
  const tools = (await import("@earendil-works/pi-tui/tools")) as {
   toolRenderers?: Record<string, { renderCall: unknown; renderResult: unknown }>;
  };
  const bash = tools.toolRenderers?.bash;
  if (!bash || typeof bash.renderCall !== "function" || typeof bash.renderResult !== "function") {
   return undefined;
  }
  return bash as unknown as OmpBashRenderer;
 } catch {
  return undefined;
 }
}
export default async function heimdall(pi: ExtensionAPI) {
 // Keep generated defaults current as soon as the extension is loaded, not only
 // after a chat session starts. This matters for source installs because
 // `pi install /path/to/pi-heimdall` only registers the package; users still
 // expect the visible default config to appear on the next Pi startup.
 ensureGeneratedDefaultConfig();

 let config: HeimdallConfig = {};
 let projectConfigPath: string | undefined;
 const disabledSet = new Set<string>();

 pi.on("session_start", async (_event, ctx) => {
  config = {};
  disabledSet.clear();
  const effective = loadEffectiveConfig(ctx.cwd);
  config = effective.config;
  projectConfigPath = effective.projectConfigPath;

  for (const error of effective.migrationErrors) {
   ctx.ui.notify(`heimdall: ${error}`, "warning");
  }

  if (Array.isArray(config.disabled)) {
   for (const d of config.disabled) {
    disabledSet.add(d);
   }
  }

  const disabledCount = [...disabledSet].filter((d) => OPT_OUT_GUARD_IDS.includes(d as typeof OPT_OUT_GUARD_IDS[number])).length;
  const active = OPT_OUT_GUARD_IDS.length - disabledCount + 1; // +1 for sandbox-guard
  const disabled = disabledCount > 0
   ? ` (disabled: ${[...disabledSet].filter((d) => OPT_OUT_GUARD_IDS.includes(d as typeof OPT_OUT_GUARD_IDS[number])).join(", ")})`
   : "";
  ctx.ui.notify(`heimdall: ${active} guards active${disabled}; defaults: ${effective.defaultConfigPath}`, "info");
 });

 // Always registered, but runtime behavior follows current loaded config.
 // Under omp, attach the host's own bash renderer so the sandboxed tool
 // renders like native bash; under Pi, pi-pretty's renderers apply.
 const ompBashRenderer = isOmpHost(pi) ? await loadOmpBashRenderer() : undefined;
 registerSandboxGuard(pi, () => config, () => projectConfigPath, ompBashRenderer);

 // Opt-out guards
 registerSecretGuard(pi, disabledSet);
 registerCommandPolicyGuard(pi, () => config, disabledSet);
 registerEnvProtect(pi, disabledSet);
 registerKubectlSecretGuard(pi, disabledSet);
 registerSopsSecretGuard(pi, disabledSet);
 registerFnoxSecretGuard(pi, disabledSet);
}
