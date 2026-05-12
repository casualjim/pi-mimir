/**
 * Detect which SIBLINGS are installed by reading ~/.pi/agent/settings.json.
 * Pure utility — no ExtensionAPI.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SIBLINGS, type SiblingPlugin } from "./siblings.js";

const PI_AGENT_SETTINGS = join(homedir(), ".pi", "agent", "settings.json");

function readInstalledPackages(): string[] {
	if (!existsSync(PI_AGENT_SETTINGS)) return [];
	try {
		const raw = readFileSync(PI_AGENT_SETTINGS, "utf-8");
		const settings = JSON.parse(raw) as { packages?: unknown };
		if (!Array.isArray(settings.packages)) return [];
		return settings.packages.filter((e): e is string => typeof e === "string");
	} catch {
		return [];
	}
}

/**
 * Return the SIBLINGS not currently installed.
 * Reads ~/.pi/agent/settings.json once per call.
 */
export function findMissingSiblings(): SiblingPlugin[] {
	const installed = readInstalledPackages();
	return SIBLINGS.filter((s) => !installed.some((entry) => s.matches.test(entry)));
}
