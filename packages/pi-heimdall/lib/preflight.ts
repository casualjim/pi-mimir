import { checkCommand, getCommandPolicyBlockReason } from "./guards/command-policy-guard.js";
import { getKubectlBlockReason } from "./guards/kubectl-secret-guard.js";
import {
	getSecretGuardBlockReason,
	getSecretReference,
	loadSecretGuardState,
	redactOutput,
	type SecretGuardState,
} from "./guards/secret-guard.js";
import { getSopsBlockReason } from "./guards/sops-secret-guard.js";
import type { HeimdallConfig } from "./types.js";

export interface HeimdallPreflightState {
	secretGuard: SecretGuardState;
}

export async function loadHeimdallPreflightState(cwd: string): Promise<HeimdallPreflightState> {
	return {
		secretGuard: await loadSecretGuardState(cwd),
	};
}

export function getBackgroundCommandBlockReason(
	command: string,
	config: HeimdallConfig,
	disabledSet: ReadonlySet<string>,
	state: HeimdallPreflightState,
): string | null {
	if (!disabledSet.has("command-policy-guard")) {
		const policy = checkCommand(command, config.commandPolicies ?? []);
		if (policy) return getCommandPolicyBlockReason(policy);
	}

	if (!disabledSet.has("secret-guard")) {
		const secretName = getSecretReference(command, state.secretGuard);
		if (secretName) return getSecretGuardBlockReason(secretName);
	}

	if (!disabledSet.has("kubectl-secret-guard")) {
		const reason = getKubectlBlockReason(command);
		if (reason) return reason;
	}

	if (!disabledSet.has("sops-secret-guard")) {
		const reason = getSopsBlockReason(command);
		if (reason) return reason;
	}

	return null;
}

export function redactBackgroundOutput(
	text: string,
	disabledSet: ReadonlySet<string>,
	state: HeimdallPreflightState,
): string {
	if (disabledSet.has("secret-guard")) return text;
	return redactOutput(text, state.secretGuard.secretValues);
}
