# pi-codebase-memory

`pi-codebase-memory` is a standalone Pi plugin that owns codebase-memory MCP setup details.

It provides:
- bundled `codebase-memory-mcp`
- automatic MCP config creation for Pi when missing
- generic raw-discovery reminders
- the public `codebase-memory` skill

## Install

```text
pi install @casualjim/pi-codebase-memory
```

After installing, reload Pi if the session does not yet expose the `codebase_memory_*` tools.

## Development

```bash
npm test
npm run typecheck
```
