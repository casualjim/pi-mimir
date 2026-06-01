# pi-codebase-memory

`pi-codebase-memory` is a standalone Pi package that wires codebase-memory MCP tools into Pi and reminds agents to use graph-first discovery before broad raw code search.

## What it provides

- `codebase-memory-mcp` bundled as a package dependency.
- Pi extension at `extensions/codebase-memory`.
- Automatic `~/.pi/agent/mcp.json` setup when no codebase-memory server is present.
- `directTools: true` MCP configuration so Pi exposes `codebase_memory_*` tools directly.
- One-shot reminders when broad raw discovery tools (`grep`, `find`, `ls`, and equivalents) are used before codebase-memory discovery.
- Public `codebase-memory` skill with graph query guidance.

## Install

```text
pi install npm:@casualjim/pi-codebase-memory
```

For local development from this monorepo:

```text
pi install ./packages/pi-codebase-memory
```

Reload Pi if the current session does not yet expose the `codebase_memory_*` tools after install.

## MCP configuration behaviour

On startup, the extension checks `~/.pi/agent/mcp.json`.

If no codebase-memory server is configured, it adds:

```json
{
  "mcpServers": {
    "codebase-memory": {
      "command": "<current node executable>",
      "args": ["<bundled codebase-memory-mcp binary>"],
      "directTools": true
    }
  }
}
```

If a codebase-memory server already exists, the extension leaves it alone. If the JSON is malformed or the bundled binary cannot be resolved, setup reports the error instead of overwriting user config.

## Discovery guidance

Agents should use this ladder for code discovery:

1. Index the current repository if needed with `codebase_memory_index_repository`.
2. Start with `codebase_memory_get_architecture`.
3. Search symbols or code with `codebase_memory_search_graph` or `codebase_memory_search_code`.
4. Trace callers, callees, or data flow with `codebase_memory_trace_path`.
5. Read exact symbol source with `codebase_memory_get_code_snippet`.
6. Use exact file reads or shell inspection for configs, text files, non-code assets, graph-insufficient cases, and follow-up verification.

If codebase-memory tools are missing or stale, report degraded discovery and avoid claiming architecture-aware analysis.

## Development

```bash
npm test --workspace @casualjim/pi-codebase-memory
npm run typecheck --workspace @casualjim/pi-codebase-memory
npm run check:pack --workspace @casualjim/pi-codebase-memory
```
