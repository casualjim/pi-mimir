import path from "node:path";

const ADR_PATH_PATTERN = /(?:^|[/\\])docs[/\\]adr[/\\].+\.md$/i;

type ToolResultEvent = {
	toolName?: unknown;
	input?: unknown;
	isError?: boolean;
};

export function isAdrWriteResult(event: ToolResultEvent): boolean {
	if (event.isError) return false;
	if (event.toolName !== "write" && event.toolName !== "edit") return false;
	const targetPath = getToolInputPath(event.input);
	return targetPath !== undefined && ADR_PATH_PATTERN.test(targetPath);
}

export function getToolInputPath(input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const candidate = (input as { path?: unknown }).path;
	return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

export function projectNameFromCwd(cwd: string): string {
	const normalized = path.resolve(cwd).replace(/^[A-Za-z]:/, "").replace(/^[/\\]+/, "");
	return normalized.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildAdrIngestionPrompt(adrPath: string, cwd: string): string {
	const project = projectNameFromCwd(cwd);
	return [
		`ADR written at ${adrPath}.`,
		"Persist it into codebase-memory now:",
		`1. Read ${adrPath}.`,
		`2. Call codebase_memory_manage_adr with project "${project}", mode "update", and content equal to the full ADR markdown.`,
		"3. Report only success or the exact codebase-memory error.",
	].join("\n");
}
