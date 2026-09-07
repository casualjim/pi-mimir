#!/usr/bin/env bun
// Dump the exact heimdall-sandbox policy JSON for a workspace directory.
// Usage: bun scripts/dump-policy.ts <workspace-dir> [command]
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	defaultConfigText,
	loadConfigFile,
	loadEffectiveConfig,
	mergeConfigLevels,
	parseConfig,
	type HeimdallConfig,
} from "../lib/heimdall-config.js";
import { buildSandboxPolicy, normalizeSandboxConfig } from "../lib/sandbox/config.js";
import { resolveHeimdallSandboxBinary } from "../lib/sandbox/runtime.js";

const cwd = resolve(process.argv[2] ?? process.cwd());
const command = process.argv[3] ?? "echo hello";

function loadEffectiveConfigReadOnly(cwd: string): ReturnType<typeof loadEffectiveConfig> {
	const configDir = join(homedir(), ".config", "heimdall");
	const defaultConfigPath = join(configDir, "default.jsonc");
	const userLevel = loadConfigFile(existsSync(join(configDir, "config.jsonc"))
		? join(configDir, "config.jsonc")
		: join(configDir, "config.json"));
	const projectConfigPath = existsSync(join(resolve(cwd), ".config", "heimdall.json"))
		? join(resolve(cwd), ".config", "heimdall.json")
		: join(resolve(cwd), ".config", "heimdall.jsonc");
	const defaultConfig = loadConfigFile(defaultConfigPath)
		?? parseConfig(defaultConfigText());
	return {
		config: mergeConfigLevels(defaultConfig as HeimdallConfig, userLevel, loadConfigFile(projectConfigPath)),
		defaultConfigPath,
		userConfigPath: existsSync(join(configDir, "config.jsonc"))
			? join(configDir, "config.jsonc")
			: join(configDir, "config.json"),
		projectConfigPath,
		migrationErrors: ["read-only config dir: skipped regeneration + migration"],
	};
}

let effective;
let rofs = false;
try {
	effective = loadEffectiveConfig(cwd);
} catch (err) {
	if ((err as NodeJS.ErrnoException).code === "EROFS") {
		rofs = true;
		effective = loadEffectiveConfigReadOnly(cwd);
	} else {
		throw err;
	}
}

const configPath = effective.userConfigPath ?? effective.projectConfigPath;
const normalized = normalizeSandboxConfig(effective.config.sandbox, configPath);
const policy = buildSandboxPolicy(normalized, cwd, command);

// Byte-exact payload written to the binary's stdin (lib/sandbox/runtime.ts: child.stdin.end(policyJson))
process.stdout.write(`${JSON.stringify(policy)}\n`);
