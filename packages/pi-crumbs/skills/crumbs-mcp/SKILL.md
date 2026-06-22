---
name: crumbs-mcp
description: "Use the codebase knowledge graph for structural code queries. Triggers on: explore the codebase, understand the architecture, what functions exist, show me the structure, who calls this function, what does X call, trace the call chain, find callers of, show dependencies, impact analysis, dead code, unused functions, high fan-out, refactor candidates, code quality audit, graph query syntax, Cypher query examples, edge types, how to use code_crumbs_search_graph."
---

# Crumbs — Knowledge Graph Tools

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
| Read exact symbol source | `code_crumbs_get_code_snippet(qualified_name="...")` |
| Dead code | `code_crumbs_search_graph(max_degree=0, exclude_entry_points=true)` |
| Cross-service edges | `code_crumbs_query_graph` with Cypher |
| Impact of changes (drift) | `code_crumbs_graph_diff` vs `code_crumbs_graph_snapshot` |
| Risk-classified trace | `code_crumbs_trace_path(risk_labels=true)` |
| Text/semantic search | `code_crumbs_search_unified` |

## Exploration Workflow
1. `code_crumbs_config_doctor` — check project + index readiness
2. `code_crumbs_index` — build/refresh the index if not ready
3. `code_crumbs_get_graph_schema` — understand node/edge types
4. `code_crumbs_search_graph(label="Function", name_pattern=".*Pattern.*")` — find code
5. `code_crumbs_get_code_snippet(qualified_name="...")` — read exact symbol source

## Tracing Workflow
1. `code_crumbs_search_graph(name_pattern=".*FuncName.*")` — discover exact name
2. `code_crumbs_trace_path(function_name="FuncName", direction="both", depth=3)` — trace
3. `code_crumbs_graph_snapshot` then later `code_crumbs_graph_diff` — map drift to affected symbols

## Quality Analysis
- Dead code: `code_crumbs_search_graph(max_degree=0, exclude_entry_points=true)`
- High fan-out: `code_crumbs_search_graph(min_degree=10, relationship="CALLS")`, inspect outbound trace
- High fan-in: `code_crumbs_search_graph(min_degree=10, relationship="CALLS")`, inspect inbound trace
- Hot paths: `code_crumbs_graph_hotspots`
- Cycles: `code_crumbs_graph_cycles`

## 20 MCP Tools
`config_doctor`, `index`, `search_unified`, `context`,
`search_graph`, `query_graph`, `trace_path`, `get_code_snippet`,
`get_graph_schema`, `get_architecture`,
`graph_stats`, `graph_cycles`, `graph_hotspots`,
`graph_star`, `graph_path`, `graph_volumes`, `graph_refactor`,
`graph_snapshot`, `graph_diff`, `graph_export`

Pi exposes these as `code_crumbs_<method>` (server name prefix).

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
`code_crumbs_search_unified` with `query`, `mode` (`hybrid`\|`lexical`\|`semantic`), `target` (`docs`\|`code`\|`all`), `file_pattern`.
- `mode: semantic` finds by meaning, not keyword
- `mode: hybrid` (default) fuses lexical + semantic + rerank
- `target: all` returns one joined ranked docs+code list
Use for natural-language questions over docs/code where name patterns miss.

## Anchored Context (crumbs-exclusive)
`code_crumbs_context` with `prompt` + >=1 `anchor` (file, symbol/key/section, or line). Resolves anchors, pulls related files, selects source regions within a token budget. Knobs: `max_related_files`, `max_regions_per_file`, `token_budget`, `chars_per_token`.

## Architecture Drift (crumbs-exclusive)
1. Save baseline: `code_crumbs_graph_snapshot`
2. After changes: `code_crumbs_graph_diff` against baseline — added/removed/changed dependencies
Detect coupling drift, cycle growth, refactor impact over time.

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
4. `code_crumbs_get_code_snippet(qualified_name)` returns the symbol node + source in one call — prefer it over manual `read` when you already know the qualified name.
5. `direction="outbound"` misses cross-service callers — use `direction="both"`.
6. Results paginate — check `has_more` and use `offset`.
