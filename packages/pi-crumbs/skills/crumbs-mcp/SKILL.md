---
name: crumbs-mcp
description: "Use the codebase knowledge graph for structural code queries. Triggers on: explore the codebase, understand the architecture, what functions exist, show me the structure, who calls this function, what does X call, trace the call chain, find callers of, show dependencies, impact analysis, dead code, unused functions, high fan-out, refactor candidates, code quality audit, graph query syntax, Cypher query examples, edge types, how to use code_crumbs_search_graph. Ex-codebase-memory users: search_graph/trace_path/query_graph/get_architecture/get_code_snippet map directly to the old codebase_memory_* names (verb-first); search_unified is the text/semantic/hybrid search."
---

# Crumbs MCP — Knowledge Graph Tools

**Default to these tools for any code discovery.** Do NOT reflexively `grep`/`rg`/`read` source files — they are fallbacks for non-code text, reading a file you are about to edit, or graph-insufficient cases only. Graph tools return precise structural results in ~500 tokens vs ~80K for a grep flood, and carry call-graph facts (callers, callees, edges, ranges) that grep cannot.

## Anti-patterns (WRONG → RIGHT)
- `rg "fn parse"` → `code_crumbs_search_graph(name_pattern="parse", label="Function")` + `code_crumbs_get_code_snippet`
- `grep -r callers` → `code_crumbs_trace_path(direction="inbound")`
- `read` whole file to find one fn → `code_crumbs_get_code_snippet(qualified_name=...)` (single call, returns file+range+source)
- `ls crates/*/src` → `code_crumbs_get_architecture`

## Quick Decision Matrix

| Question | Tool call |
|----------|----------|
| Who calls X? | `code_crumbs_trace_path(direction="inbound")` |
| What does X call? | `code_crumbs_trace_path(direction="outbound")` |
| Full call context | `code_crumbs_trace_path(direction="both")` |
| Find by name pattern | `code_crumbs_search_graph(name_pattern="...")` |
| Dead code | `code_crumbs_search_graph(max_degree=0, exclude_entry_points=true)` |
| Read exact source | `code_crumbs_get_code_snippet(qualified_name="...")` |
| Cross-service edges | `code_crumbs_query_graph` with Cypher |
| Source grep + graph metadata | `code_crumbs_search_code(pattern="...")` |
| Risk-classified trace | `code_crumbs_trace_path(risk_labels=true)` |
| Text/semantic search | `code_crumbs_search_unified` |
| Pi session message chunks | `code_crumbs_search_sessions` (snippet + message pointer + token estimate) |
| Push one session message | `code_crumbs_session_ingest` |
| List projects | `code_crumbs_list_projects` |
| Project readiness | `code_crumbs_project_status` |

## Exploration Workflow
1. `code_crumbs_project_status` — check a specific project's index readiness (per-project, V138); `code_crumbs_config_doctor` for whole-config readiness. `code_crumbs_list_projects` enumerates known project names.
2. `code_crumbs_index` — build/refresh the index if not ready
3. `code_crumbs_get_graph_schema` — understand node/edge types
4. `code_crumbs_search_graph(label="Function", name_pattern=".*Pattern.*")` — find code
5. `code_crumbs_get_code_snippet(qualified_name="...")` — read exact symbol source in one call (returns `file_path`+`start_line`+`end_line`+source)

## Tracing Workflow
1. `code_crumbs_search_graph(name_pattern=".*FuncName.*")` — discover exact name
2. `code_crumbs_trace_path(function_name="FuncName", direction="both", depth=3)` — trace (nodes carry `file_path`+`start_line`+`end_line`)
3. Topology drift (snapshot/diff) is CLI-only: `crumbs graph snapshot` / `crumbs graph diff` (V137)

## Quality Analysis
- Dead code: `code_crumbs_search_graph(max_degree=0, exclude_entry_points=true)`
- High fan-out: `code_crumbs_search_graph(min_degree=10, relationship="CALLS")`, inspect outbound trace
- High fan-in: `code_crumbs_search_graph(min_degree=10, relationship="CALLS")`, inspect inbound trace
- Hot paths: `code_crumbs_graph_hotspots`
- Cycles: `code_crumbs_graph_cycles`

## 22 MCP Tools
Discovery (verb-first, match old `codebase_memory_*`): `config_doctor`, `index`, `search_unified`, `search_code`, `context`,
`search_graph`, `query_graph`, `trace_path`, `get_code_snippet`, `get_graph_schema`, `get_architecture`.
Project admin: `list_projects`, `project_status` (`delete_project` ⊥ MCP — CLI-only destructive, V135).
Sessions (Crumbs-exclusive): `session_ingest` (push one finalized message), `search_sessions` (chunk-snippet search; distinct root from `search_unified`/`search_code`/`search_graph`, V121).
Topology (Crumbs-exclusive): `graph_stats`, `graph_cycles`, `graph_hotspots`,
`graph_star`, `graph_path`, `graph_volumes`, `graph_refactor`.
`graph_export`/`graph_snapshot`/`graph_diff` ⊥ MCP (CLI-only JSON file contracts, V137).

## Per-call Project Selection (V138)
20 of 22 tools accept an optional `project` selector (name | slug | path) overriding the cwd-resolved project — applies to every discovery/read/index/context/graph/topology/search/session tool plus `project_status` and `graph_stats`. Omit it (or `None`) to target the cwd-resolved project. Resolve order: exact path → config-name (`[projects.<name>]`) → registry slug.
- `list_projects` and `config_doctor` do NOT take `project` — they operate on the whole config (global user-scope XOR per-project config file), not one project.
- Discover project names with `code_crumbs_list_projects`, then pass `project="name"` to scope any graph/search/topology call.

## Edge Types
CALLS, HTTP_CALLS, IMPORTS, DEFINES, DEFINES_METHOD,
USAGE, FILE_CHANGES_WITH, CONTAINS_FILE, CONTAINS_FOLDER,
WRITES, INHERITS, RAISES, SEMANTICALLY_RELATED, SIMILAR_TO

## Cypher Examples (for code_crumbs_query_graph)
```
MATCH (a)-[r:HTTP_CALLS]->(b) RETURN a.name, b.name, r.url_path, r.confidence LIMIT 20
MATCH (f:Function) WHERE f.name =~ '.*Handler.*' RETURN f.name, f.file_path LIMIT 50
MATCH (a)-[r:CALLS]->(b) WHERE a.name = 'main' RETURN b.name
```

## Semantic & Hybrid Search (crumbs-exclusive)
`code_crumbs_search_unified` with `query`, `mode` (`hybrid`|`lexical`|`semantic`), `target` (`docs`|`code`|`all`), `file_pattern`.
- `mode: semantic` finds by meaning, not keyword
- `mode: hybrid` (default) fuses lexical + semantic + rerank
- `target: all` returns one joined ranked docs+code list
Use for natural-language questions over docs/code where name patterns miss.

## Source Search (crumbs-exclusive)
`code_crumbs_search_code` with `pattern`, `mode` (`compact`|`full`|`files`), `file_pattern`, `path_filter`, `regex`, `limit`.
Graph-augmented on-disk grep: enriches textual matches with indexed node metadata (qualified name, label, file, line range, call degrees). Distinct from `search_unified` (retrieval over chunks) and `search_graph` (structural query).

## Session Search (crumbs-exclusive)
`code_crumbs_search_sessions` with `query`, `mode` (`hybrid`|`lexical`|`semantic`), `limit`; optional `role`, `since`, `session_id`.
Searches pi session message chunks (chunk-granular hybrid). Returns chunk snippets carrying a message pointer + message token estimate — never full transcripts. Distinct root from `search_unified`/`search_code`/`search_graph` (V121).
`code_crumbs_session_ingest` pushes one finalized message (`session` + `message` with extracted text); chunk+embed+persist is idempotent (V143). Bulk session indexing runs as a concurrent phase of `code_crumbs_index` when `[sessions] enabled = true` (off by default).

## Anchored Context (crumbs-exclusive)
`code_crumbs_context` with `prompt` + >=1 `anchor` (file, symbol/key/section, or line). Resolves anchors, pulls related files, selects source regions within a token budget. Knobs: `max_related_files`, `max_regions_per_file`, `token_budget`, `chars_per_token`.

## Architecture Drift (CLI-only)
`graph_export`/`graph_snapshot`/`graph_diff` are CLI-only JSON file contracts (V137) — NOT MCP tools.
Use `crumbs graph snapshot` then `crumbs graph diff` against the saved baseline to detect coupling
drift, cycle growth, and refactor impact over time.

## Topology Analysis (crumbs-exclusive)
- Hot files/modules: `code_crumbs_graph_hotspots`
- Feature volumes: `code_crumbs_graph_volumes`
- Refactor plan: `code_crumbs_graph_refactor`
- File neighborhood: `code_crumbs_graph_star(center, max_depth)`
- Dependency path A->B: `code_crumbs_graph_path(from, to)`
- Graph-wide stats: `code_crumbs_graph_stats`

## Gotchas
1. `code_crumbs_search_graph(relationship="HTTP_CALLS")` filters nodes by degree — use `code_crumbs_query_graph` with Cypher to see actual edges.
2. `code_crumbs_query_graph` can return huge rows (100k cap) — add `LIMIT`, or page via `code_crumbs_search_graph` `offset`.
3. `code_crumbs_trace_path` needs exact-ish names — use `code_crumbs_search_graph(name_pattern=...)` first.
4. `code_crumbs_get_code_snippet(qualified_name=...)` returns exact source in one call — prefer it over search-then-read.
5. `direction="outbound"` misses cross-service callers — use `direction="both"`.
6. Results paginate — check `has_more` and use `offset`.
