import { join } from "node:path";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function getAgentConfigDir(): string {
	return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

export function getSubagentsConfigPath(): string {
	return join(getAgentConfigDir(), "herdr-agents", "config.json");
}

export function getSubagentsConfigExamplePath(): string {
	return join(PACKAGE_ROOT, "config.json.example");
}

export function getSubagentsPackageRoot(): string {
	return PACKAGE_ROOT;
}
