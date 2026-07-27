import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { getRawDiscoverySearchToken } from "./crumbs-gate.js";
import { getCrumbsBin } from "./bin-resolve.js";

const execFileAsync = promisify(execFile);
const AUGMENT_LIMIT = 5;
const AUGMENT_TIMEOUT_MS = 300;

export interface PendingGraphAugment {
	token: string;
}

interface SearchGraphResult {
	results?: Array<{ qualified_name?: unknown; name?: unknown; file_path?: unknown; label?: unknown }>;
}

export function getPendingGraphAugment(event: { toolName?: unknown; input?: unknown }): PendingGraphAugment | undefined {
	const token = getRawDiscoverySearchToken(event);
	return token ? { token } : undefined;
}

export async function buildGraphAugmentation(cwd: string, pending: PendingGraphAugment): Promise<string | undefined> {
	const bin = getCrumbsBin();
	if (!bin) return undefined;
	const result = await searchGraph(bin, cwd, pending.token);
	return result?.results?.length ? formatAugmentation(pending.token, result.results) : undefined;
}

export function prependGraphAugmentation<T extends unknown[]>(content: T, augmentation: string): T {
	return [{ type: "text", text: augmentation }, ...content] as T;
}

/* Project resolution lives in the binary: `ProjectResolver` (crumbs
 * crates/crumbs/src/api/project_resolve.rs) accepts a repo-root path, a
 * [projects.*] config name, or a registry slug, and does workspace-root
 * discovery for the path form. Passing the cwd path is one call; guessing slug
 * and basename candidates here was up to 9 sequential process spawns inside a
 * 300ms budget, nearly all of them misses. */
async function searchGraph(bin: string, cwd: string, token: string): Promise<SearchGraphResult | undefined> {
	try {
		const { stdout, stderr } = await execFileAsync(bin, ["graph", "--project", path.resolve(cwd), "search", "--name-pattern", `.*${token}.*`, "--limit", String(AUGMENT_LIMIT), "--format", "json"], {
			cwd,
			timeout: AUGMENT_TIMEOUT_MS,
			maxBuffer: 256 * 1024,
		});
		const text = stdout.trim() || stderr.trim();
		if (!text) return undefined;
		return parseSearchGraphOutput(text);
	} catch {
		return undefined;
	}
}

function parseSearchGraphOutput(text: string): SearchGraphResult | undefined {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end < start) return undefined;
	try {
		return JSON.parse(text.slice(start, end + 1)) as SearchGraphResult;
	} catch {
		return undefined;
	}
}

function formatAugmentation(token: string, results: NonNullable<SearchGraphResult["results"]>): string {
	const rows = results.slice(0, AUGMENT_LIMIT).map((result) => {
		const display = stringProp(result.qualified_name) || stringProp(result.name) || "<unknown>";
		const file = stringProp(result.file_path);
		const label = stringProp(result.label);
		return `- ${display}${file ? `  ${file}` : ""}${label ? `  ${label}` : ""}`;
	});
	return [`[crumbs] ${rows.length} graph symbol(s) match "${token}" (structured context; raw search result below unaffected):`, ...rows].join("\n");
}

function stringProp(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

