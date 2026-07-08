# pi-crumbs

`pi-crumbs` is a standalone Pi package that wires Crumbs MCP tools into Pi and reminds agents to use graph-first discovery before broad raw code search. Crumbs is a superset of codebase-memory with a shorter name: structural graph queries plus semantic/hybrid retrieval, anchored context assembly, and topology drift tracking.

The package assumes the `crumbs` binary is already installed and available on `$PATH` (or via `PI_CRUMBS_BIN`). It does not install `crumbs`, but it does write the MCP server configuration into `~/.pi/agent/mcp.json` automatically.

## What it provides

- Pi extension at `extensions/crumbs`.
- `crumbs` binary resolution from `$PATH` (with `PI_CRUMBS_BIN` override and `~/.cargo/bin/crumbs` fallback).
- Automatic `~/.pi/agent/mcp.json` setup when no crumbs server is present.
- `directTools: true` MCP configuration so Pi exposes crumbs tools (`code_crumbs_search_graph`, `code_crumbs_trace_path`, `code_crumbs_config_doctor`, `code_crumbs_index`, `code_crumbs_search_unified`, `code_crumbs_context`, `code_crumbs_get_code_snippet`, etc.) directly.
- Pi-native session reminders on startup/resume/compact.
- One-shot reminders when broad raw discovery tools are used before Crumbs discovery.
- Non-blocking graph context augmentation for broad raw discovery (`rg`/`grep`/`find`/`ls` via `bash`, plus direct `grep`/`find`/`ls`/`Glob` tool calls when present).
- Public `crumbs-mcp` skill with MCP-based discovery guidance.

## Install

```text
pi install npm:@casualjim/pi-crumbs
```

For local development from this monorepo:

```text
pi install ./packages/pi-crumbs
```

`crumbs` must be installed separately and reachable on `$PATH`, for example:

```bash
cargo install --path /path/to/crumbs/crates/crumbs-cli
```

Reload Pi if the current session does not yet expose the crumbs tools after install.

## MCP configuration behaviour

On startup, the extension checks `~/.pi/agent/mcp.json`.

If no crumbs server is configured, it adds:

```json
{
  "mcpServers": {
    "code_crumbs": {
      "command": "<resolved absolute path to crumbs binary>",
      "args": ["mcp", "serve", "--transport", "stdio"],
      "directTools": true
    }
  }
}
```

If a crumbs server already exists, the extension leaves it alone. If the JSON is malformed or the binary cannot be resolved, setup reports the error instead of overwriting user config.

## Binary resolution

On session start the extension resolves the Crumbs binary in this order:

1. `PI_CRUMBS_BIN` environment variable, if set and non-empty.
2. `crumbs` found by scanning `$PATH` (executable bit checked).
3. `~/.cargo/bin/crumbs` fallback.

## Discovery guidance

Agents should use this ladder for discovery (code, markdown docs, sessions):

1. Index the current repository if needed with `code_crumbs_index`.
2. Start with `code_crumbs_get_architecture`.
3. Search symbols or code with `code_crumbs_search_graph` or `code_crumbs_search_unified`.
4. **Search markdown docs** (README/ROADMAP/PLAN/TASKS/`.md`) with `code_crumbs_search_unified` (`target=documents`, `mode=lexical` for keywords/identifiers or `hybrid` for concepts) — do NOT `grep`/`read` whole docs to find a section.
5. **Search past sessions** with `code_crumbs_search_sessions`.
6. Trace callers, callees, or data flow with `code_crumbs_trace_path`.
7. Read exact symbol source with `code_crumbs_get_code_snippet` (or raw `read` from node `file_path` + `start_line`/`end_line`).
8. Use exact file reads or shell inspection for raw configs, non-markdown assets, graph-insufficient cases, and follow-up verification.

Crumbs-exclusive capabilities beyond the baseline ladder:

- Semantic/hybrid retrieval: `code_crumbs_search_unified` with `mode=semantic|hybrid` for meaning-based lookup over docs/code where name patterns miss.
- Anchored context: `code_crumbs_context` to assemble a prompt-ready payload from file/symbol/line anchors within a token budget.
- Topology analysis: `code_crumbs_graph_hotspots`, `code_crumbs_graph_cycles`, `code_crumbs_graph_volumes`, `code_crumbs_graph_star`, `code_crumbs_graph_path`, `code_crumbs_graph_stats`, `code_crumbs_graph_refactor`.
- Architecture drift: save `code_crumbs_graph_snapshot` now, then `code_crumbs_graph_diff` later to track coupling/cycle growth.

If crumbs tools are missing or stale, report degraded discovery and avoid claiming graph-aware analysis.

## Development

```bash
pnpm --filter @casualjim/pi-crumbs test
pnpm --filter @casualjim/pi-crumbs typecheck
pnpm --filter @casualjim/pi-crumbs check:pack
```
