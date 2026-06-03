/**
 * Guidance injection — resolves and injects subfolder guidance files.
 *
 * At each directory depth below project root down to the touched file's
 * directory, picks the first existing of:
 *   AGENTS.md > CLAUDE.md
 *
 * Depth 0 (project root) skips AGENTS.md/CLAUDE.md because Pi's own
 * resource-loader already loads <cwd>/AGENTS.md or <cwd>/CLAUDE.md into
 * the system prompt's # Project Context block.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FLAG_DEBUG, MSG_TYPE_GUIDANCE } from "./constants.js";

// ---------------------------------------------------------------------------
// Guidance Resolution
// ---------------------------------------------------------------------------

type GuidanceKind = "agents" | "claude";

interface GuidanceFile {
	/** Forward-slash-normalized path from project root — stable dedup key. */
	relativePath: string;
	absolutePath: string;
	content: string;
	kind: GuidanceKind;
}

/**
 * Resolve guidance files for a given file path.
 *
 * Walks from below project root to the file's directory. At each depth, picks
 * the first existing of AGENTS.md > CLAUDE.md.
 *
 * Returns files root-first (general → specific), at most one per depth.
 */
export function resolveGuidance(filePath: string, projectDir: string): GuidanceFile[] {
	const fileDir = dirname(filePath);
	const relativeDir = relative(projectDir, fileDir);

	// Guard: file is outside project root
	if (relativeDir.startsWith("..") || isAbsolute(relativeDir)) {
		return [];
	}

	const parts = relativeDir ? relativeDir.split(sep) : [];
	const results: GuidanceFile[] = [];

	for (let depth = 1; depth <= parts.length; depth++) {
		const subPath = parts.slice(0, depth).join(sep);
		const candidates: Array<{ relative: string; kind: GuidanceKind }> = [
			{ relative: join(subPath, "AGENTS.md"), kind: "agents" },
			{ relative: join(subPath, "CLAUDE.md"), kind: "claude" },
		];

		for (const candidate of candidates) {
			const absolute = join(projectDir, candidate.relative);
			if (existsSync(absolute)) {
				results.push({
					relativePath: candidate.relative.split(sep).join("/"),
					absolutePath: absolute,
					content: readFileSync(absolute, "utf-8"),
					kind: candidate.kind,
				});
				break; // first-match wins at this depth
			}
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// Session State
// ---------------------------------------------------------------------------

/** In-memory set of injected guidance paths per session. */
const injectedGuidance = new Set<string>();

export function clearInjectionState() {
	injectedGuidance.clear();
}

// ---------------------------------------------------------------------------
// Tool-call Handler
// ---------------------------------------------------------------------------

/**
 * Handle guidance injection on tool_call events for read/edit/write.
 * Sends hidden messages via pi.sendMessage as a side effect.
 */
export function handleToolCallGuidance(
	event: { toolName: string; input: Record<string, unknown> },
	ctx: { cwd: string },
	pi: ExtensionAPI,
): void {
	if (!["read", "edit", "write"].includes(event.toolName)) return;

	const filePath = (event.input as any).file_path ?? (event.input as any).path;
	if (!filePath) return;

	const resolved = resolveGuidance(filePath, ctx.cwd);
	if (resolved.length === 0) return;

	const newFiles = resolved.filter((g) => !injectedGuidance.has(g.relativePath));
	if (newFiles.length === 0) return;

	// Mark before sendMessage — idempotence > reliability.
	for (const g of newFiles) {
		injectedGuidance.add(g.relativePath);
	}

	const trigger = `auto-loaded because ${event.toolName} touched ${shortenPath(filePath, ctx.cwd)}`;
	const contextParts = newFiles.map((g) => wrapGuidance(formatLabel(g), g.content, trigger));

	pi.sendMessage({
		customType: MSG_TYPE_GUIDANCE,
		content: contextParts.join("\n\n---\n\n"),
		display: !!pi.getFlag(FLAG_DEBUG),
	});
}

/**
 * Wrap guidance content in a non-task envelope.
 */
function wrapGuidance(label: string, content: string, trigger: string): string {
	return [
		`[openspec-guidance — reference material, NOT a task. ${trigger}.`,
		`Consult only if directly relevant to the user's current request; otherwise ignore.]`,
		"",
		`## Project Guidance: ${label}`,
		"",
		content,
	].join("\n");
}

/**
 * Render a project-relative, forward-slash-normalized path for the trigger.
 */
function shortenPath(filePath: string, cwd: string): string {
	const r = relative(cwd, filePath);
	return r && !r.startsWith("..") ? r.split(sep).join("/") : filePath;
}

/**
 * Format a guidance file's heading label.
 */
function formatLabel(g: GuidanceFile): string {
	const fileName = g.kind === "agents" ? "AGENTS.md" : "CLAUDE.md";
	const idx = g.relativePath.lastIndexOf("/");
	const sub = idx > 0 ? g.relativePath.slice(0, idx) : "";
	return `${sub || "root"} (${fileName})`;
}
