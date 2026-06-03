/**
 * sandbox-guard
 *
 * Pi-facing sandbox guard adapter. Native sandbox policy construction,
 * runtime launch, and filesystem matching live under ../sandbox/.
 */

import {
	createBashTool,
	isToolCallEventType,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import type { HeimdallConfig } from "../types.js";
import { isDenied, isWritable } from "../sandbox/filesystem-policy.js";
import { normalizeSandboxConfig } from "../sandbox/config.js";
import {
	MISSING_BINARY_MESSAGE,
	createSandboxedBashOps,
	ensureNoSandboxFlag,
	resolveHeimdallSandboxBinary,
} from "../sandbox/runtime.js";
import type { SandboxConfig, NormalizedSandboxConfig } from "../sandbox/types.js";

export function registerSandboxGuard(
	pi: ExtensionAPI,
	getHeimdallConfig: () => HeimdallConfig,
	getConfigPath?: () => string | undefined,
): void {
	let sandboxConfig: NormalizedSandboxConfig | null = null;
	let sandboxCwd = process.cwd();
	let sandboxBinary = resolveHeimdallSandboxBinary().binaryPath;

	ensureNoSandboxFlag(pi);

	pi.on("session_start", async (_event, ctx) => {
		sandboxCwd = ctx.cwd;
		const noSandbox = pi.getFlag("no-sandbox") as boolean;
		if (noSandbox) {
			sandboxConfig = null;
			ctx.ui.notify("heimdall sandbox: disabled via --no-sandbox", "warning");
			return;
		}

		const config = normalizeSandboxConfig(
			getHeimdallConfig().sandbox as SandboxConfig | undefined,
			getConfigPath?.(),
		);
		const binaryResolution = resolveHeimdallSandboxBinary(config.binaryPath);
		sandboxBinary = binaryResolution.binaryPath;
		sandboxConfig = null;
		if (!config.enabled) {
			return;
		}

		if (!binaryResolution.found) {
			ctx.ui.notify(MISSING_BINARY_MESSAGE, "warning");
		}

		sandboxConfig = config;

		const writeCount = config.policy.filesystem?.writable?.length ?? 0;
		const envDenyCount = config.policy.env?.deny?.length ?? 0;
		const envIcon = envDenyCount > 0 ? `🔒${envDenyCount}` : "";
		const networkIcon = config.policy.network === "host" ? "↔" : "⊘";
		const theme = ctx.ui.theme;

		ctx.ui.setStatus(
			"heimdall-sandbox",
			[
				theme.fg("accent", "🛡"),
				theme.fg("success", `✎${writeCount}`),
				theme.fg("muted", envIcon),
				theme.fg(config.policy.network === "host" ? "success" : "warning", networkIcon),
			].join(theme.fg("dim", "│")),
		);
		ctx.ui.notify("heimdall sandbox: active", "info");
	});

	const defaultOps = () => createSandboxedBashOps(sandboxConfig!, sandboxCwd, { binaryPath: sandboxBinary });

	const localCwd = process.cwd();
	const localBash = createBashTool(localCwd);

	pi.registerTool({
		...localBash,
		label: "bash (heimdall sandbox)",
		async execute(id, params, signal, onUpdate) {
			if (!sandboxConfig) {
				return localBash.execute(id, params, signal, onUpdate);
			}

			const ops = defaultOps();
			const sandboxedBash = createBashTool(sandboxCwd, { operations: ops });
			return sandboxedBash.execute(id, params, signal, onUpdate);
		},
	});

	pi.on("user_bash", async (_event) => {
		if (!sandboxConfig) return undefined;

		return {
			operations: defaultOps(),
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!sandboxConfig) return undefined;

		const filesystem = sandboxConfig.policy.filesystem;

		const block = (operation: "read" | "write", path: string) => {
			const reason =
				`Blocked: ${event.toolName} attempted to ${operation} "${path}" denied by heimdall sandbox filesystem policy. ` +
				`Adjust .pi/heimdall.jsonc to allow this path.`;
			if (ctx.hasUI) ctx.ui.notify(`heimdall sandbox: blocked ${event.toolName} ${path}`, "warning");
			return { block: true as const, reason };
		};

		const input = event.input as Record<string, unknown>;
		const path = typeof input.path === "string" ? input.path : ".";

		if (isDenied(filesystem, sandboxCwd, path)) {
			return block("read", path);
		}

		if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
			if (!isWritable(filesystem, sandboxCwd, path)) {
				return block("write", path);
			}
		}

		return undefined;
	});

	pi.registerCommand("sandbox", {
		description: "Show heimdall sandbox configuration",
		handler: async (_args, ctx) => {
			if (!sandboxConfig) {
				ctx.ui.notify("heimdall sandbox: disabled", "info");
				return;
			}

			let version = "unknown";
			try {
				version = execSync(`"${sandboxBinary}" --version`, { encoding: "utf-8" }).trim();
			} catch { /* ignore */ }

			const lines = [
				"heimdall sandbox configuration:",
				"",
				`Binary: ${sandboxBinary}`,
				`Version: ${version}`,
				"Policy fragment:",
				JSON.stringify(sandboxConfig.policy, null, 2),
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}

