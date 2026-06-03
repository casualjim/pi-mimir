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
 *   - Generated defaults: ~/.pi/agent/heimdall.default.jsonc
 *   - User-level:        ~/.pi/agent/heimdall.jsonc (fallback: .json)
 *   - Project-level:     repo root `.pi/heimdall.jsonc` (fallback: .json)
 *
 * sandbox-guard always runs (when enabled in config).
 * The following guards can be disabled via the `disabled` array:
 *   - secret-guard, command-policy-guard, env-protect,
 *   - kubectl-secret-guard, sops-secret-guard
 */

import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
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
import { registerSandboxGuard } from "../lib/guards/sandbox-guard.js";

export default function heimdall(pi: ExtensionAPI) {
	// Keep generated defaults current as soon as the extension is loaded, not only
	// after a chat session starts. This matters for source installs because
	// `pi install /path/to/pi-heimdall` only registers the package; users still
	// expect the visible default config to appear on the next Pi startup.
	ensureGeneratedDefaultConfig(getAgentDir());

	let config: HeimdallConfig = {};
	let projectConfigPath: string | undefined;
	const disabledSet = new Set<string>();

	pi.on("session_start", async (_event, ctx) => {
		config = {};
		disabledSet.clear();
		const effective = loadEffectiveConfig(getAgentDir(), ctx.cwd);
		config = effective.config;
		projectConfigPath = effective.projectConfigPath;

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
	registerSandboxGuard(pi, () => config, () => projectConfigPath);

	// Opt-out guards
	registerSecretGuard(pi, disabledSet);
	registerCommandPolicyGuard(pi, () => config, disabledSet);
	registerEnvProtect(pi, disabledSet);
	registerKubectlSecretGuard(pi, disabledSet);
	registerSopsSecretGuard(pi, disabledSet);
}
