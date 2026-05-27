const RAW_DISCOVERY_TOOLS = new Set(["grep", "find", "ls"]);
const DEFAULT_GATE_SCOPE = "__default__";

const advisedScopes = new Set<string>();

export function resetCodebaseMemoryGate(scopeKey?: string): void {
	if (scopeKey) advisedScopes.delete(scopeKey);
	else advisedScopes.clear();
}

export function handleCodebaseMemoryDiscoveryGate(event: { toolName?: unknown }, scopeKey = DEFAULT_GATE_SCOPE): { content: string } | undefined {
	if (advisedScopes.has(scopeKey) || typeof event.toolName !== "string" || !RAW_DISCOVERY_TOOLS.has(event.toolName)) return undefined;
	advisedScopes.add(scopeKey);
	return {
		content: [
			"codebase-memory reminder: for broad code discovery, prefer codebase-memory MCP tools first.",
			"If the current project is not indexed yet, run codebase_memory_index_repository on the project root first. Then use codebase_memory_get_architecture for overview, codebase_memory_search_graph/search_code for symbols or code search, codebase_memory_trace_path for call chains, and codebase_memory_get_code_snippet to read source.",
			"Raw grep/find/ls remain available for text, configs, non-code files, graph-insufficient cases, and exact follow-up discovery. Read is never gated; always read files before editing.",
		].join(" "),
	};
}
