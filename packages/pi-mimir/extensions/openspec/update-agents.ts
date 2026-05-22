/**
 * /openspec-update-agents — apply-mode sync of bundled agents into <cwd>/.pi/agents/.
 * Adds new, overwrites changed managed files, removes stale managed files.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type SyncResult, syncBundledAgents } from "./agents.js";
import { writeOpenSpecAssetManifest } from "./managed-assets.js";

const MSG_UP_TO_DATE = "All agents already up-to-date.";
const MSG_NO_CHANGES = "No changes needed.";

const msgSynced = (parts: string[]) => `Synced agents: ${parts.join(", ")}.`;
const msgSyncedWithErrors = (summary: string, errors: string[]) =>
	`${summary} ${errors.length} error(s): ${errors.join("; ")}`;

export function registerUpdateAgentsCommand(pi: ExtensionAPI): void {
	pi.registerCommand("openspec-update-agents", {
		description: "Sync bundled agents and refresh the OpenSpec asset manifest",
		handler: async (_args, ctx) => {
			const result = syncBundledAgents(ctx.cwd, true);
			writeOpenSpecAssetManifest(ctx.cwd);
			if (!ctx.hasUI) return;
			ctx.ui.notify(formatSyncReport(result), result.errors.length > 0 ? "warning" : "info");
		},
	});
}

function formatSyncReport(result: SyncResult): string {
	const totalSynced = result.added.length + result.updated.length + result.removed.length;
	if (totalSynced === 0 && result.errors.length === 0) return MSG_UP_TO_DATE;

	const parts: string[] = [];
	if (result.added.length > 0) parts.push(`${result.added.length} added`);
	if (result.updated.length > 0) parts.push(`${result.updated.length} updated`);
	if (result.removed.length > 0) parts.push(`${result.removed.length} removed`);

	const summary = parts.length > 0 ? msgSynced(parts) : MSG_NO_CHANGES;
	if (result.errors.length > 0) {
		return msgSyncedWithErrors(
			summary,
			result.errors.map((e) => e.message),
		);
	}
	return summary;
}
