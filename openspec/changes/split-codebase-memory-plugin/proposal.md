## Why

`pi-mimir` currently owns both the OpenSpec workflow and the codebase-memory integration details. That mixes two separable concerns, makes the package responsible for MCP wiring and bundled binaries it should not own, and prevents codebase-memory support from evolving as its own reusable Pi plugin.

The workflow should still require codebase-memory for full setup, but setup must become honest about the boundary: `pi-mimir` should sync its OpenSpec assets, then report setup as incomplete until the separate `pi-codebase-memory` plugin is installed and active.

## What Changes

- Split codebase-memory ownership out of `packages/pi-mimir` into a separate workspace package/plugin named `pi-codebase-memory`.
- Move generic codebase-memory assets into the new plugin, including MCP setup/config ownership, bundled `codebase-memory-mcp`, generic codebase-memory guidance/skill content, and related tests.
- Change `pi-mimir` to depend on codebase-memory as an external capability rather than configuring MCP itself.
- Update `/openspec:init` and `/openspec:update` to sync OpenSpec assets first, then soft-fail setup completeness when codebase-memory tools are unavailable.
- Show the exact install command `pi install @casualjim/pi-codebase-memory` when codebase-memory support is missing.
- Keep degraded runtime discovery behavior available, but stop claiming full workflow readiness when the plugin is absent or broken.

## Capabilities

### New Capabilities
- `external-codebase-memory-plugin`: defines the new package boundary where `pi-codebase-memory` owns codebase-memory setup, MCP wiring, and generic discovery assets while `pi-mimir` consumes the exposed tools.
- `workflow-setup-completeness`: defines how `pi-mimir` reports partial vs complete workflow setup after syncing assets, including the exact installation guidance for the missing plugin.

### Modified Capabilities
- None.

## Impact

- Affected code in `packages/pi-mimir/extensions/openspec/`, especially `package-checks.ts`, `openspec-commands.ts`, `update-agents.ts`, `session-hooks.ts`, and `codebase-memory-gate.ts`.
- New workspace package under `packages/pi-codebase-memory/` with its own extension/plugin assets, package manifest, and tests.
- README and package documentation updates for installation and setup expectations.
- Test updates for setup reporting, package registration, and plugin/tool availability checks.
