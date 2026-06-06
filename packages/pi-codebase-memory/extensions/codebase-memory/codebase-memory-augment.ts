import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { getRawDiscoverySearchToken } from "./codebase-memory-gate.js";
import { projectNameFromCwd } from "./adr-watcher.js";
import { resolveBundledCodebaseMemoryMcpBin } from "./mcp-config.js";

const execFileAsync = promisify(execFile);
const AUGMENT_LIMIT = 5;
const AUGMENT_TIMEOUT_MS = 300;
const MAX_WALKUP = 8;

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
	const bin = resolveBundledCodebaseMemoryMcpBin();
	if (!bin) return undefined;
	for (const project of projectCandidates(cwd)) {
		const result = await searchGraph(bin, project, pending.token);
		if (result === "project-error") continue;
		if (!result?.results?.length) return undefined;
		return formatAugmentation(pending.token, result.results);
	}
	return undefined;
}

export function prependGraphAugmentation<T extends unknown[]>(content: T, augmentation: string): T {
	return [{ type: "text", text: augmentation }, ...content] as T;
}

async function searchGraph(bin: string, project: string, token: string): Promise<SearchGraphResult | "project-error" | undefined> {
	try {
		const args = {
			project,
			name_pattern: `.*${token}.*`,
			limit: AUGMENT_LIMIT,
		};
		const { stdout, stderr } = await execFileAsync(process.execPath, [bin, "cli", "search_graph", JSON.stringify(args)], {
			timeout: AUGMENT_TIMEOUT_MS,
			maxBuffer: 256 * 1024,
		});
		const text = stdout.trim() || stderr.trim();
		if (!text) return undefined;
		if (/project .*not found|not indexed|unknown project/i.test(text)) return "project-error";
		return parseSearchGraphOutput(text);
	} catch (error) {
		const text = error instanceof Error ? error.message : String(error);
		return /project .*not found|not indexed|unknown project/i.test(text) ? "project-error" : undefined;
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
	return [`[codebase-memory] ${rows.length} graph symbol(s) match "${token}" (structured context; raw search result below unaffected):`, ...rows].join("\n");
}

function stringProp(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function projectCandidates(cwd: string): string[] {
	const candidates: string[] = [];
	let current = path.resolve(cwd);
	for (let i = 0; i < MAX_WALKUP; i++) {
		addCandidate(candidates, path.basename(current));
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	addCandidate(candidates, projectNameFromCwd(cwd));
	return candidates;
}

function addCandidate(candidates: string[], value: string): void {
	const normalized = value.trim();
	if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
}
