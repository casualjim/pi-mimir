export type SandboxStdio = "piped" | "inherit" | "null";

export type SandboxNetworkPolicy = "host" | "none" | string;

export type SandboxProcPolicy = "default" | "none" | string;

export interface SandboxEnvPolicy {
	allow?: string[] | null;
	deny?: string[] | null;
}

export interface SandboxFilesystemPolicy {
	deny?: string[];
	writable?: string[];
	virtual?: Record<string, string>;
}

export interface SandboxPolicyFragment {
	network?: SandboxNetworkPolicy;
	proc?: SandboxProcPolicy;
	env?: SandboxEnvPolicy;
	filesystem?: SandboxFilesystemPolicy;
	/** Mount SSH agent sockets when Linux isolation is used. */
	sshAgent?: boolean;
	/** Mount GnuPG agent, keyboxd, and dirmngr sockets when Linux isolation is used. */
	gpgAgent?: boolean;
	/** Mount age-compatible agent sockets when Linux isolation is used. */
	ageAgent?: boolean;
}

export interface SandboxConfig extends SandboxPolicyFragment {
	/** Pi-local toggle. Not part of the native heimdall-sandbox policy. */
	enabled?: boolean;
	/** Pi-local path to the native heimdall-sandbox binary. Not forwarded to policy. */
	binaryPath?: string;
	/** Pi-local toggle for generated default filesystem denies. Not forwarded to policy. */
	useDefaultFilesystemDeny?: boolean;
}

export interface GeneratedSandboxPolicy extends SandboxPolicyFragment {
	cwd: string;
	command: ["bash", "-c", string];
	stdio: "piped" | "inherit";
}

export interface NormalizedSandboxConfig {
	enabled: boolean;
	binaryPath?: string;
	policy: SandboxPolicyFragment;
}
