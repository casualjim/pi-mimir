import { readFileSync, writeFileSync } from "node:fs";
import type {
	GeneratedSandboxPolicy,
	NormalizedSandboxConfig,
	SandboxConfig,
	SandboxFilesystemPolicy,
	SandboxPolicyFragment,
} from "./types.js";

interface LegacyPathsConfig {
	[key: string]: { mode: string };
}

function migratePathsToFilesystem(paths: LegacyPathsConfig): SandboxFilesystemPolicy {
	const deny: string[] = [];
	const writable: string[] = [];
	for (const [path, entry] of Object.entries(paths)) {
		if (entry.mode === "deny") deny.push(path);
		else if (entry.mode === "write" || entry.mode === "writable") writable.push(path);
	}
	const fs: SandboxFilesystemPolicy = {};
	if (deny.length > 0) fs.deny = deny;
	if (writable.length > 0) fs.writable = writable;
	return fs;
}

export function normalizeSandboxConfig(
	config?: SandboxConfig | Record<string, unknown>,
	configPath?: string,
): NormalizedSandboxConfig {
	const raw = config ?? {};
	const sandbox = { ...raw } as SandboxConfig & { paths?: LegacyPathsConfig };
	const policy: SandboxPolicyFragment = {};

	if (sandbox.paths && typeof sandbox.paths === "object" && !sandbox.filesystem) {
		sandbox.filesystem = migratePathsToFilesystem(sandbox.paths);
		delete sandbox.paths;

		if (configPath) {
			try {
				const full = JSON.parse(readFileSync(configPath, "utf-8"));
				if (full.sandbox?.paths && !full.sandbox?.filesystem) {
					full.sandbox.filesystem = sandbox.filesystem;
					delete full.sandbox.paths;
					writeFileSync(configPath, JSON.stringify(full, null, 2) + "\n");
				}
			} catch {
				// best-effort migration
			}
		}
	}

	if (sandbox.network !== undefined) policy.network = sandbox.network;
	if (sandbox.proc !== undefined) policy.proc = sandbox.proc;
	if (sandbox.env !== undefined) {
		policy.env = {};
		if (sandbox.env.allow !== undefined) policy.env.allow = sandbox.env.allow;
		if (sandbox.env.deny !== undefined) policy.env.deny = sandbox.env.deny;
	}
	if (sandbox.filesystem !== undefined) {
		policy.filesystem = { ...sandbox.filesystem };
	} else {
		policy.filesystem = {};
	}
	if (sandbox.sshAgent !== undefined) policy.sshAgent = sandbox.sshAgent;
	if (sandbox.gpgAgent !== undefined) policy.gpgAgent = sandbox.gpgAgent;
	if (sandbox.ageAgent !== undefined) policy.ageAgent = sandbox.ageAgent;

	return {
		enabled: sandbox.enabled ?? false,
		...(sandbox.binaryPath ? { binaryPath: sandbox.binaryPath } : {}),
		policy,
	};
}

export function buildSandboxPolicy(
	config: NormalizedSandboxConfig,
	cwd: string,
	command: string,
	stdio: "inherit" | "piped" = "piped",
): GeneratedSandboxPolicy {
	return {
		...config.policy,
		cwd,
		command: ["bash", "-c", command],
		stdio,
	};
}
