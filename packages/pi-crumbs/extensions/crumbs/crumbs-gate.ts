const RAW_DISCOVERY_TOOLS = new Set(["grep", "Grep", "glob", "Glob", "find", "ls"]);
const DEFAULT_GATE_SCOPE = "__default__";

const advisedScopes = new Set<string>();

export const CRUMBS_SESSION_REMINDER = [
	"CRITICAL - Crumbs Code Discovery Protocol:",
	"1. ALWAYS use Crumbs MCP tools FIRST for ANY code exploration:",
	"   - code_crumbs_search_graph (name_pattern/label/qn_pattern) to find functions/classes/routes",
	"   - code_crumbs_trace_path (function_name, mode=calls|data_flow|cross_service) for call chains",
	"   - code_crumbs_get_code_snippet (qualified_name) for exact symbol source",
	"   - code_crumbs_query_graph (query) for complex Cypher patterns",
	"   - code_crumbs_get_architecture (aspects) for project structure",
	"   - code_crumbs_search_unified (query, mode=hybrid|lexical|semantic) for text/semantic search (graph-augmented)",
	"2. Use bash/read freely for text, configs, non-code files, and always read files before editing them.",
	"3. If a project is not indexed yet, run code_crumbs_index FIRST.",
].join("\n");

export function resetCrumbsGate(scopeKey?: string): void {
	if (scopeKey) advisedScopes.delete(scopeKey);
	else advisedScopes.clear();
}

export function handleCrumbsDiscoveryGate(event: { toolName?: unknown; input?: unknown }, scopeKey = DEFAULT_GATE_SCOPE): { content: string } | undefined {
	if (advisedScopes.has(scopeKey) || !isRawDiscoveryCall(event)) return undefined;
	advisedScopes.add(scopeKey);
	return {
		content: [
			"code_crumbs reminder: for broad code discovery, prefer Crumbs MCP tools first.",
			"If the current project is not indexed yet, run code_crumbs_index on the project root first. Then use code_crumbs_get_architecture for overview, code_crumbs_search_graph for symbols or code search, code_crumbs_trace_path for call chains, and code_crumbs_get_code_snippet to read exact symbol source.",
			"Raw bash/read remain available for text, configs, non-code files, graph-insufficient cases, and exact follow-up discovery. Read is never gated; always read files before editing.",
		].join(" "),
	};
}

export function isRawDiscoveryCall(event: { toolName?: unknown; input?: unknown }): boolean {
	if (typeof event.toolName !== "string") return false;
	if (RAW_DISCOVERY_TOOLS.has(event.toolName)) return true;
	if (event.toolName !== "bash") return false;
	const command = getInputString(event.input, "command");
	return command ? /(^|[\s;&|()])(?:rg|grep|find|ls)(?:\s|$)/.test(command) : false;
}

export function getRawDiscoverySearchToken(event: { toolName?: unknown; input?: unknown }): string | undefined {
	if (!isRawDiscoveryCall(event)) return undefined;
	const pattern = getRawDiscoveryPattern(event);
	return extractSearchToken(pattern);
}

function getRawDiscoveryPattern(event: { toolName?: unknown; input?: unknown }): string | undefined {
	if (typeof event.toolName !== "string") return undefined;
	if (event.toolName === "bash") return getInputString(event.input, "command");
	return getInputString(event.input, "pattern") ?? getInputString(event.input, "query") ?? getInputString(event.input, "path") ?? event.toolName;
}

function getInputString(input: unknown, key: string): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const value = (input as Record<string, unknown>)[key];
	return typeof value === "string" && value.trim() ? value : undefined;
}

export function extractSearchToken(pattern: string | undefined): string | undefined {
	if (!pattern) return undefined;
	let best = "";
	for (const match of pattern.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
		const token = match[0];
		if (token.length > best.length) best = token;
	}
	if (best.length < 4) return undefined;
	return best.slice(0, 96);
}
