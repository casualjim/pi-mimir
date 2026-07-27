---
name: code-crumbs
description: Use the codebase knowledge graph for structural code queries. Use to explore the codebase, understand the architecture, what functions exist, show me the structure, who calls this function, what does X call, trace the call chain, find callers of, show dependencies, impact analysis, dead code, unused functions, high fan-out, refactor candidates, code quality audit, graph query syntax, Cypher query examples, edge types, how to use search_graph.
---

# Crumbs — Knowledge Graph Tools

Graph tools return precise structural results in ~500 tokens vs ~80K for grep.

## Quick Decision Matrix

| Question | Tool call |
|----------|----------|
| Who calls X? | `trace_path(direction="inbound")` |
| What does X call? | `trace_path(direction="outbound")` |
| Full call context | `trace_path(direction="both")` |
| Find by name pattern | `search_graph(name_pattern="...")` |
| Read exact source | `get_code_snippet(qualified_name="...")` |
| Dead code | `search_graph(max_degree=0, exclude_entry_points=true)` |
| Cross-service edges | `query_graph` with Cypher |
| Project structure | `get_architecture` |
| Text search | `search_code(pattern="...")` |
| File neighborhood | `graph_star(center, max_depth)` |
| Dependency path A→B | `graph_path(from, to)` |

All tools are prefixed `code_crumbs_` (e.g. `code_crumbs_search_graph`).

## Exploration Workflow
1. `project_status` — check if the project is indexed
2. `get_graph_schema` — understand node/edge types
3. `search_graph(label="Function", name_pattern=".*Pattern.*")` — find code
4. `get_code_snippet(qualified_name="project.path.FuncName")` — read source

## Tracing Workflow
1. `search_graph(name_pattern=".*FuncName.*")` — discover exact name
2. `trace_path(function_name="FuncName", direction="both", depth=3)` — trace

## Quality Analysis
- Dead code: `search_graph(max_degree=0, exclude_entry_points=true)`
- High fan-out: `search_graph(min_degree=10, relationship="CALLS")`, inspect outbound trace
- High fan-in: `search_graph(min_degree=10, relationship="CALLS")`, inspect inbound trace

## Topology
Whole-graph algorithms over the same code graph — reach for these when the question is about
structure across many files rather than one symbol.

| Question | Tool call |
|----------|----------|
| What sits around this file? | `graph_star(center, max_depth)` |
| How does A depend on B? | `graph_path(from, to)` |
| Which files are hot / central? | `graph_hotspots` |
| Where are the dependency cycles? | `graph_cycles` |
| How big is each feature area? | `graph_volumes` |
| Where should I cut for a refactor? | `graph_refactor` |
| Graph-wide counters | `graph_stats` |

Drift over time is CLI-only: `crumbs graph snapshot > baseline.json`, later `crumbs graph diff baseline.json`.

## Core Tools
`project_status`, `list_projects`, `index`, `search_graph`, `search_code`,
`trace_path`, `query_graph`, `get_graph_schema`, `get_code_snippet`, `get_architecture`,
`graph_star`, `graph_path`, `graph_hotspots`, `graph_cycles`, `graph_volumes`,
`graph_refactor`, `graph_stats`

## Edge Types
CALLS, HTTP_CALLS, IMPORTS, DEFINES, DEFINES_METHOD,
USAGE, FILE_CHANGES_WITH, CONTAINS_FILE, CONTAINS_FOLDER,
WRITES, INHERITS, RAISES, SEMANTICALLY_RELATED, SIMILAR_TO

## Cypher Examples (for query_graph)
```
MATCH (a)-[r:HTTP_CALLS]->(b) RETURN a.name, b.name, r.url_path, r.confidence LIMIT 20
MATCH (f:Function) WHERE f.name =~ '.*Handler.*' RETURN f.name, f.file_path LIMIT 50
MATCH (a)-[r:CALLS]->(b) WHERE a.name = 'main' RETURN b.name
```

## Gotchas
1. `search_graph(relationship="HTTP_CALLS")` filters nodes by degree — use `query_graph` with Cypher to see actual edges.
2. `query_graph` can return huge rows — add `LIMIT`.
3. `trace_path` needs exact-ish names — use `search_graph(name_pattern=...)` first.
4. `get_code_snippet` returns exact source in one call — prefer it over search-then-read.
5. `direction="outbound"` misses cross-service callers — use `direction="both"`.
6. Results paginate — check `has_more` and use `offset`.

## Prose, not code
Crumbs also indexes markdown docs and past sessions — see the `docs-crumbs` skill.
Most relevant here: never `grep`/`read` a whole README/ROADMAP/PLAN to find a section, use
`search_unified(target="documents")` instead. Also `search_sessions` for past conversations
and `context` for anchored context packs.
