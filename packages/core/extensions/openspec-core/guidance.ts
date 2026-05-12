/**
 * Guidance injection — resolves and injects subfolder guidance files.
 *
 * At each directory depth from project root down to the touched file's
 * directory, picks the first existing of:
 *   AGENTS.md > CLAUDE.md > .rpiv/guidance/<sub>/architecture.md
 *
 * Depth 0 (project root) skips AGENTS.md/CLAUDE.md because Pi's own
 * resource-loader already loads <cwd>/AGENTS.md or <cwd>/CLAUDE.md into
 * the system prompt's # Project Context block. Depth 0 still checks
 * <cwd>/.rpiv/guidance/architecture.md — Pi's loader does not see that
 * path.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FLAG_DEBUG, MSG_TYPE_GUIDANCE } from "./constants.js";

// ---------------------------------------------------------------------------
// Guidance Resolution
// ---------------------------------------------------------------------------

type GuidanceKind = "agents" | "claude" | "architecture";

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
 * Walks from project root to the file's directory. At each depth, picks
 * the first existing of AGENTS.md > CLAUDE.md > architecture.md.
 * Depth 0 only checks architecture.md — Pi's loader already handles
 * <cwd>/AGENTS.md and <cwd>/CLAUDE.md.
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

	for (let depth = 0; depth <= parts.length; depth++) {
		const subPath = parts.slice(0, depth).join(sep);

		// Per-depth candidate ladder. First-match wins.
		const candidates: Array<{ relative: string; kind: GuidanceKind }> = [];

		// Depth 0: skip AGENTS/CLAUDE — Pi's loader handles <cwd> already.
		if (depth > 0) {
			candidates.push({ relative: join(subPath, "AGENTS.md"), kind: "agents" });
			candidates.push({ relative: join(subPath, "CLAUDE.md"), kind: "claude" });
		}
		candidates.push({
			relative: subPath
				? join(".rpiv", "guidance", subPath, "architecture.md")
				: join(".rpiv", "guidance", "architecture.md"),
			kind: "architecture",
		});

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
// Root Guidance Injection (session_start)
// ---------------------------------------------------------------------------

/**
 * Inject the root `.rpiv/guidance/architecture.md` at session start.
 */
export function injectRootGuidance(cwd: string, pi: ExtensionAPI): void {
	const relativePath = ".rpiv/guidance/architecture.md";

	if (injectedGuidance.has(relativePath)) return;

	const absolutePath = join(cwd, relativePath);
	if (!existsSync(absolutePath)) return;

	let content: string;
	try {
		content = readFileSync(absolutePath, "utf-8");
	} catch {
		// Silent failure — session_start runs before any UI is bound.
		return;
	}
	injectedGuidance.add(relativePath);

	const file: GuidanceFile = { relativePath, absolutePath, content, kind: "architecture" };
	pi.sendMessage({
		customType: MSG_TYPE_GUIDANCE,
		content: wrapGuidance(formatLabel(file), content, "auto-loaded at session start"),
		display: !!pi.getFlag(FLAG_DEBUG),
	});
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
		`## Architecture Guidance: ${label}`,
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
	if (g.kind === "architecture") {
		const stripped = g.relativePath.replace(/^\.rpiv\/guidance\//, "");
		const sub = stripped === "architecture.md" ? "" : stripped.replace(/\/architecture\.md$/, "");
		return `${sub || "root"} (architecture.md)`;
	}
	const fileName = g.kind === "agents" ? "AGENTS.md" : "CLAUDE.md";
	const idx = g.relativePath.lastIndexOf("/");
	const sub = idx > 0 ? g.relativePath.slice(0, idx) : "";
	return `${sub || "root"} (${fileName})`;
}
