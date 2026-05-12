/**
 * /openspec-setup — installs any SIBLINGS not present in ~/.pi/agent/settings.json.
 *
 * Serial `pi install <pkg>` loop. Reports succeeded/failed split;
 * prompts the user to restart Pi on success.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findMissingSiblings } from "./package-checks.js";
import type { SiblingPlugin } from "./siblings.js";

const INSTALL_TIMEOUT_MS = 120_000;
const STDERR_SNIPPET_CHARS = 300;

const MSG_INTERACTIVE_ONLY = "/openspec-setup requires interactive mode";
const MSG_NOTHING_TO_DO = "All pi-openspec-workflow sibling dependencies already installed.";
const MSG_CANCELLED = "/openspec-setup cancelled";
const MSG_CONFIRM_TITLE = "Apply pi-openspec-workflow setup changes?";
const MSG_RESTART = "Restart your Pi session to load the newly-installed extensions.";

const msgInstalling = (pkg: string) => `Installing ${pkg}…`;
const msgInstalledLine = (pkgs: string[]) => `✓ Installed: ${pkgs.join(", ")}`;
const msgFailedHeader = () => `✗ Failed:`;
const msgFailedLine = (pkg: string, err: string) => `  ${pkg}: ${err}`;

type UI = {
	notify: (msg: string, sev: "info" | "warning" | "error") => void;
	confirm: (title: string, body: string) => Promise<boolean>;
};

function buildConfirmBody(missing: SiblingPlugin[]): string {
	const lines: string[] = ["pi-openspec-workflow will install the following:", ""];
	for (const m of missing) lines.push(`  • ${m.pkg}  (required — provides ${m.provides})`);
	lines.push("", "Your `~/.pi/agent/settings.json` will be updated. Proceed?");
	return lines.join("\n");
}

export function registerSetupCommand(pi: ExtensionAPI): void {
	pi.registerCommand("openspec-setup", {
		description: "Install pi-openspec-workflow's sibling extension plugins",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify(MSG_INTERACTIVE_ONLY, "error");
				return;
			}

			const missing = findMissingSiblings();
			if (missing.length === 0) {
				ctx.ui.notify(MSG_NOTHING_TO_DO, "info");
				return;
			}

			const confirmed = await ctx.ui.confirm(MSG_CONFIRM_TITLE, buildConfirmBody(missing));
			if (!confirmed) {
				ctx.ui.notify(MSG_CANCELLED, "info");
				return;
			}

			const { succeeded, failed } = await installMissing(pi, ctx.ui, missing);
			ctx.ui.notify(buildReport(succeeded, failed), failed.length > 0 ? "warning" : "info");
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
