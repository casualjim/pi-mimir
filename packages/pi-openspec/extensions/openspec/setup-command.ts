/**
 * /openspec-setup — installs any SIBLINGS not present in ~/.pi/agent/settings.json.
 *
 * Serial `pi install <pkg>` loop. Reports succeeded/failed split;
 * prompts the user to restart Pi on success.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findMissingSiblings, hasCodebaseMemoryMcp } from "./package-checks.js";
import type { SiblingPlugin } from "./siblings.js";

const INSTALL_TIMEOUT_MS = 120_000;
const STDERR_SNIPPET_CHARS = 300;

const MSG_INTERACTIVE_ONLY = "/openspec-setup requires interactive mode";
const MSG_NOTHING_TO_DO = "All pi-openspec sibling dependencies already installed.";
const MSG_OPENSPEC_OK = "✓ OpenSpec CLI available.";
const MSG_CANCELLED = "/openspec-setup cancelled";
const MSG_CONFIRM_TITLE = "Apply pi-openspec setup changes?";
const MSG_RESTART = "Restart your Pi session to load the newly-installed extensions.";
const MSG_OPENSPEC_MISSING = "OpenSpec CLI is missing. Install with: npm i -g @FissionAI/openspec";
const CODEBASE_MEMORY_PROMPT = [
	"codebase-memory MCP tools were not detected in ~/.pi/agent/mcp.json.",
	"Copy this prompt into Pi or another agent:",
	"Install and configure codebase-memory MCP for this Pi project through pi-mcp-adapter. After setup, verify tools such as codebase_memory_get_architecture, codebase_memory_search_graph, codebase_memory_search_code, codebase_memory_trace_path, and codebase_memory_get_code_snippet are available.",
].join("\n");

const msgInstalling = (pkg: string) => `Installing ${pkg}…`;
const msgInstalledLine = (pkgs: string[]) => `✓ Installed: ${pkgs.join(", ")}`;
const msgFailedHeader = () => `✗ Failed:`;
const msgFailedLine = (pkg: string, err: string) => `  ${pkg}: ${err}`;

type UI = {
	notify: (msg: string, sev: "info" | "warning" | "error") => void;
	confirm: (title: string, body: string) => Promise<boolean>;
};

function buildConfirmBody(missing: SiblingPlugin[]): string {
	const lines: string[] = ["pi-openspec will install the following:", ""];
	for (const m of missing) lines.push(`  • ${m.pkg}  (required — provides ${m.provides})`);
	lines.push("", "Your `~/.pi/agent/settings.json` will be updated. Proceed?");
	return lines.join("\n");
}

export function registerSetupCommand(pi: ExtensionAPI): void {
	pi.registerCommand("openspec-setup", {
		description: "Install pi-openspec prerequisites: sibling plugins, OpenSpec CLI, and codebase-memory MCP guidance",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify(MSG_INTERACTIVE_ONLY, "error");
				return;
			}

			const notices: Array<{ msg: string; sev: "info" | "warning" }> = [];
			const openspec = await checkOpenSpecCli(pi);
			if (openspec) notices.push({ msg: MSG_OPENSPEC_OK, sev: "info" });
			else notices.push({ msg: MSG_OPENSPEC_MISSING, sev: "warning" });
			if (!hasCodebaseMemoryMcp()) notices.push({ msg: CODEBASE_MEMORY_PROMPT, sev: "warning" });

			const missing = findMissingSiblings();
			if (missing.length === 0) {
				ctx.ui.notify(
					[MSG_NOTHING_TO_DO, ...notices.map((n) => n.msg)].join("\n\n"),
					notices.some((n) => n.sev === "warning") ? "warning" : "info",
				);
				return;
			}

			const confirmed = await ctx.ui.confirm(MSG_CONFIRM_TITLE, buildConfirmBody(missing));
			if (!confirmed) {
				ctx.ui.notify(MSG_CANCELLED, "info");
				return;
			}

			const { succeeded, failed } = await installMissing(pi, ctx.ui, missing);
			const report = [buildReport(succeeded, failed), ...notices.map((n) => n.msg)].filter(Boolean).join("\n\n");
			ctx.ui.notify(report, failed.length > 0 || notices.some((n) => n.sev === "warning") ? "warning" : "info");
		},
	});
}

async function installMissing(
	pi: ExtensionAPI,
	ui: UI,
	missing: SiblingPlugin[],
): Promise<{ succeeded: string[]; failed: Array<{ pkg: string; error: string }> }> {
	const succeeded: string[] = [];
	const failed: Array<{ pkg: string; error: string }> = [];
	for (const { pkg } of missing) {
		ui.notify(msgInstalling(pkg), "info");
		try {
			const result = await piExec(pi, "pi", ["install", pkg]);
			if (result.code === 0) {
				succeeded.push(pkg);
			} else {
				failed.push({
					pkg,
					error: (result.stderr || result.stdout || `exit ${result.code}`).trim().slice(0, STDERR_SNIPPET_CHARS),
				});
			}
		} catch (err) {
			failed.push({ pkg, error: err instanceof Error ? err.message : String(err) });
		}
	}
	return { succeeded, failed };
}

async function checkOpenSpecCli(pi: ExtensionAPI): Promise<boolean> {
	try {
		const result = await piExec(pi, "openspec", ["--version"]);
		return result.code === 0;
	} catch {
		return false;
	}
}

function piExec(pi: ExtensionAPI, cmd: string, args: string[]) {
	return pi.exec(cmd, args, { timeout: INSTALL_TIMEOUT_MS });
}

function buildReport(succeeded: string[], failed: Array<{ pkg: string; error: string }>): string {
	const lines: string[] = [];
	if (succeeded.length > 0) lines.push(msgInstalledLine(succeeded));
	if (failed.length > 0) {
		lines.push(msgFailedHeader());
		for (const { pkg, error } of failed) lines.push(msgFailedLine(pkg, error));
	}
	if (succeeded.length > 0) {
		lines.push("", MSG_RESTART);
	}
	return lines.join("\n");
}
