import type { SandboxConfig } from "./sandbox/types.js";

export interface HeimdallConfig {
	disabled?: string[];
	sandbox?: Partial<SandboxConfig>;
	commandPolicies?: CommandPolicy[];
}

export interface CommandPolicy {
	name: string;
	blocked: string[];
	message: string;
}

/** Guards that can be disabled via the `disabled` array in heimdall.json. */
export type OptOutGuardId =
	| "secret-guard"
	| "command-policy-guard"
	| "env-protect"
	| "kubectl-secret-guard"
	| "sops-secret-guard";
