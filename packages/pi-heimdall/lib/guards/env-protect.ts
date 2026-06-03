/**
 * env-protect
 *
 * Blocks `read` tool calls that target `.env` files.
 * Allows through example/template variants (.env.example, .env.sample, etc.)
 */

import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";

const EXAMPLE_SUFFIXES = ["example", "sample", "template", "dist", "defaults"];

function isExampleVariant(name: string): boolean {
	const lower = name.toLowerCase();
	return EXAMPLE_SUFFIXES.some(
		(suffix) => lower.endsWith(`.${suffix}`) || lower.includes(`.${suffix}.`),
	);
}

function isDotenvPath(rawPath: string): boolean {
	const path = rawPath.replace(/^@/, "");
	const name = basename(path).toLowerCase();

	if (name === ".env" || name === ".envrc") return true;
	if (name.startsWith(".env.")) return !isExampleVariant(name);
	if (name.endsWith(".env")) return !isExampleVariant(name);

	return false;
}

export function registerEnvProtect(pi: ExtensionAPI, disabledSet: Set<string>): void {
	pi.on("tool_call", async (event, ctx) => {
		if (disabledSet.has("env-protect")) return undefined;
		if (!isToolCallEventType("read", event)) return undefined;

		const path = event.input.path;
		if (typeof path !== "string" || !isDotenvPath(path)) return undefined;

		const reason =
			`Blocked: reading dotenv file "${path}" is forbidden. ` +
			`This is protected by pi-heimdall/env-protect. ` +
			`If the user needs the contents, ask them to paste the relevant values directly. ` +
			`Never attempt to bypass this protection (cat, head, tail, xxd, base64, etc.) ` +
			`and never ask the user to disable it.`;

		if (ctx.hasUI) {
			ctx.ui.notify(`heimdall: blocked read of ${path}`, "warning");
		}

		return { block: true, reason };
	});
}
