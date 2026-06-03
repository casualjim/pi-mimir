import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BashOperations, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildSandboxPolicy } from "./config.js";
import type { GeneratedSandboxPolicy, NormalizedSandboxConfig } from "./types.js";

export const MISSING_BINARY_MESSAGE =
	"heimdall sandbox: heimdall-sandbox binary not found on PATH. " +
	"Install it with Homebrew from the casualjim tap, install @casualjim/heimdall-sandbox with npm, " +
	"or run via npx @casualjim/heimdall-sandbox. You can also set sandbox.binaryPath.";

export interface SandboxBinaryResolution {
	binaryPath: string;
	found: boolean;
	source: "config" | "npm" | "path" | "default";
}

export function resolveHeimdallSandboxBinary(configuredBinaryPath?: string): SandboxBinaryResolution {
	if (configuredBinaryPath?.trim()) {
		return { binaryPath: configuredBinaryPath.trim(), found: true, source: "config" };
	}

	for (const pkg of [
		"@casualjim/heimdall-sandbox-darwin-arm64",
		"@casualjim/heimdall-sandbox-linux-x64",
		"@casualjim/heimdall-sandbox-linux-arm64",
	]) {
		try {
			const candidate = fileURLToPath(import.meta.resolve(`${pkg}/bin/heimdall-sandbox`));
			if (existsSync(candidate)) return { binaryPath: candidate, found: true, source: "npm" };
		} catch {
			// Package not installed on this platform
		}
	}

	const binaryName = "heimdall-sandbox";
	const pathEnv = process.env.PATH ?? "";
	for (const dir of pathEnv.split(delimiter)) {
		if (!dir) continue;
		const candidate = join(dir, binaryName);
		if (existsSync(candidate)) return { binaryPath: candidate, found: true, source: "path" };
	}

	return { binaryPath: binaryName, found: false, source: "default" };
}

export function findHeimdallSandboxBinary(): string {
	return resolveHeimdallSandboxBinary().binaryPath;
}

export type SpawnLike = typeof spawn;

const NO_SANDBOX_FLAG_SYMBOL = Symbol.for("pi-heimdall.no-sandbox-flag");

export function ensureNoSandboxFlag(pi: ExtensionAPI): void {
	const installedPi = pi as unknown as Record<PropertyKey, unknown>;
	if (installedPi[NO_SANDBOX_FLAG_SYMBOL]) return;
	installedPi[NO_SANDBOX_FLAG_SYMBOL] = true;
	pi.registerFlag("no-sandbox", {
		description: "Disable native heimdall-sandbox delegation for bash commands",
		type: "boolean",
		default: false,
	});
}

export function terminateSandboxProcessGroup(
	child: ChildProcessWithoutNullStreams,
	signal: NodeJS.Signals = "SIGTERM",
): void {
	if (!child.pid) {
		child.kill(signal);
		return;
	}

	try {
		process.kill(-child.pid, signal);
	} catch {
		child.kill(signal);
	}
}

export interface SandboxLaunchResult {
	binaryPath: string;
	child: ChildProcessWithoutNullStreams;
	cwd: string;
	policy: GeneratedSandboxPolicy;
	policyJson: string;
}

export async function launchSandboxProcess(
	config: NormalizedSandboxConfig,
	command: string,
	options: { cwd: string; binaryPath?: string; spawnFn?: SpawnLike; env?: NodeJS.ProcessEnv } = { cwd: process.cwd() },
): Promise<SandboxLaunchResult> {
	const binaryPath = options.binaryPath ?? findHeimdallSandboxBinary();
	const spawnFn = options.spawnFn ?? spawn;
	const workDir = options.cwd;
	if (!existsSync(workDir)) {
		throw new Error(`Working directory does not exist: ${workDir}`);
	}

	const policy = buildSandboxPolicy(config, workDir, command);
	const policyJson = `${JSON.stringify(policy)}\n`;
	const child = spawnFn(binaryPath, ["exec", "--policy", "-"], {
		cwd: workDir,
		env: options.env ?? process.env,
		detached: true,
		stdio: ["pipe", "pipe", "pipe"],
	});

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		const onError = (err: Error) => {
			if (settled) return;
			settled = true;
			child.removeListener("spawn", onSpawn);
			reject(new Error(
				`Failed to launch heimdall-sandbox at ${JSON.stringify(binaryPath)}: ${err.message}`,
			));
		};
		const onSpawn = () => {
			if (settled) return;
			settled = true;
			child.removeListener("error", onError);
			resolve();
		};
		child.once("error", onError);
		child.once("spawn", onSpawn);
		queueMicrotask(onSpawn);
	});

	return { binaryPath, child, cwd: workDir, policy, policyJson };
}

export function createSandboxedBashOps(
	config: NormalizedSandboxConfig,
	defaultCwd: string,
	options: { binaryPath?: string; spawnFn?: SpawnLike } = {},
): BashOperations {
	return {
		async exec(command, execCwd, { onData, signal, timeout, env }) {
			const workDir = execCwd || defaultCwd;
			const { child, policyJson } = await launchSandboxProcess(config, command, {
				binaryPath: options.binaryPath,
				cwd: workDir,
				env,
				spawnFn: options.spawnFn,
			});

			return await new Promise((resolve, reject) => {
				let settled = false;
				const settleReject = (error: Error) => {
					if (settled) return;
					settled = true;
					reject(error);
				};
				const settleResolve = (exitCode: number | null) => {
					if (settled) return;
					settled = true;
					resolve({ exitCode });
				};

				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						terminateSandboxProcessGroup(child, "SIGKILL");
					}, timeout * 1000);
				}

				child.stdout.on("data", onData);
				child.stderr.on("data", onData);
				child.stdin.end(policyJson);

				const onAbort = () => {
					terminateSandboxProcessGroup(child, "SIGKILL");
				};

				signal?.addEventListener("abort", onAbort, { once: true });

				child.on("close", (code) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					signal?.removeEventListener("abort", onAbort);

					if (signal?.aborted) {
						settleReject(new Error("aborted"));
					} else if (timedOut) {
						settleReject(new Error(`timeout:${timeout}`));
					} else {
						settleResolve(code);
					}
				});
			});
		},
	};
}
