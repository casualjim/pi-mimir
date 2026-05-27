## 1. Create the standalone codebase-memory package

- [x] 1.1 Scaffold `packages/pi-codebase-memory/` as a Pi workspace package with its own `package.json`, published assets, and documentation.
- [x] 1.2 Move generic codebase-memory assets into `pi-codebase-memory`, including the generic skill, raw-discovery reminder behavior, and any codebase-memory-specific extension entrypoints.
- [x] 1.3 Move MCP/config ownership into `pi-codebase-memory`, including bundled `codebase-memory-mcp`, server wiring, and related setup helpers.

## 2. Refactor pi-mimir to consume external codebase-memory capabilities

- [x] 2.1 Remove plugin-owned codebase-memory logic from `packages/pi-mimir/extensions/openspec/package-checks.ts` and replace it with readiness checks based on required `codebase_memory_*` tool availability.
- [x] 2.2 Update `packages/pi-mimir/extensions/openspec/openspec-commands.ts` and `update-agents.ts` so `/openspec:init` and `/openspec:update` sync OpenSpec assets first, then report complete vs incomplete setup.
- [x] 2.3 Update session/runtime messaging in `packages/pi-mimir/extensions/openspec/session-hooks.ts` and related guidance so missing support reports degraded discovery and points users to `pi install @casualjim/pi-codebase-memory`.
- [x] 2.4 Remove bundled `codebase-memory-mcp` ownership and other plugin-specific packaging references from `packages/pi-mimir/package.json` and related package metadata.

## 3. Split tests and docs along the new boundary

- [x] 3.1 Move or recreate codebase-memory-specific tests under `packages/pi-codebase-memory/` for MCP/config ownership and generic assets.
- [x] 3.2 Update `packages/pi-mimir` tests to cover incomplete setup reporting, exact install guidance, capability-based readiness checks, and degraded-discovery messaging.
- [x] 3.3 Update repository and package READMEs to describe the separate-install model and the required command `pi install @casualjim/pi-codebase-memory`.

## 4. Validate the two-package workflow

- [x] 4.1 Verify workspace installation and package registration for both `pi-mimir` and `pi-codebase-memory`.
- [x] 4.2 Run the relevant test suites and confirm `/openspec:init` and `/openspec:update` report incomplete setup when codebase-memory tools are unavailable and complete setup when they are active.
