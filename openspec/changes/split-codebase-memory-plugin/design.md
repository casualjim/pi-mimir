## Context

`pi-mimir` currently mixes two layers of responsibility:

- OpenSpec workflow behavior and setup reporting
- codebase-memory integration details such as MCP detection, `mcp.json` writes, bundled `codebase-memory-mcp`, and generic codebase-memory guidance assets

That makes `pi-mimir` responsible for plugin internals it should not own and prevents codebase-memory support from standing alone as a reusable Pi package. The requested target state is an explicit package boundary: `pi-codebase-memory` is separately installed, and `pi-mimir` shows the exact install command `pi install @casualjim/pi-codebase-memory` when full workflow setup is incomplete.

This is a cross-cutting change because it affects workspace layout, package manifests, runtime checks, setup reporting, documentation, and tests.

## Goals / Non-Goals

**Goals:**
- Create a separate workspace package/plugin `pi-codebase-memory`.
- Move codebase-memory ownership into that package, including MCP/binary/config concerns and generic codebase-memory assets.
- Keep `pi-mimir` focused on OpenSpec workflow behavior and capability checks.
- Make `/openspec:init` and `/openspec:update` sync assets first, then report incomplete setup when codebase-memory tools are unavailable.
- Show the exact install command `pi install @casualjim/pi-codebase-memory` whenever that incomplete state is reported.
- Preserve degraded discovery messaging without overstating workflow readiness.

**Non-Goals:**
- Do not remove the workflow requirement for codebase-memory.
- Do not add automatic installation of `pi-codebase-memory` from `pi-mimir`.
- Do not redesign the OpenSpec workflow surface (`plan`, `implement`, review entrypoints).
- Do not change archive, commit, push, PR, or finishing-branch behavior.

## Decisions

### Decision 1: Introduce a dedicated workspace package for codebase-memory
Create `packages/pi-codebase-memory/` as its own Pi package. It owns:

- bundled `codebase-memory-mcp`
- MCP server/config setup
- direct-tools exposure
- generic codebase-memory skill and guidance assets
- codebase-memory-specific tests and docs

`pi-mimir` stops packaging those concerns directly.

**Why:** this matches the desired install model and creates a clean reusable plugin boundary.

**Alternative considered:** keep codebase-memory bundled in `pi-mimir` and only reorganize files. Rejected because it preserves the ownership problem and does not create a separately installed plugin.

### Decision 2: pi-mimir uses capability checks, not plugin internals
`pi-mimir` determines workflow completeness from availability of the required `codebase_memory_*` tools rather than by editing `mcp.json`, resolving `codebase-memory-mcp/bin.js`, or treating package presence alone as success.

**Why:** the workflow cares about whether the tools are actually usable in-session, not which internal mechanism made them available.

**Alternative considered:** keep checking plugin-owned config files from `pi-mimir`. Rejected because it leaks plugin internals across the package boundary and still allows false positives when configuration exists but tools are not active.

### Decision 3: Setup is sync-first, then completeness is evaluated
`/openspec:init` and `/openspec:update` continue to sync OpenSpec-owned assets first. After sync, they evaluate codebase-memory capability availability and emit one of two outcomes:

- complete: all required workflow assets are synced and codebase-memory tools are available
- incomplete: workflow assets are synced, but full workflow readiness is not available yet

The incomplete message must include the exact command:

```text
pi install @casualjim/pi-codebase-memory
```

**Why:** this preserves useful setup work while honestly reporting that full workflow readiness has not been achieved.

**Alternative considered:** fail before mutating the repo when the plugin is missing. Rejected because it blocks useful OpenSpec asset sync and does not match the desired sync-first behavior.

### Decision 4: Generic codebase-memory assets move; OpenSpec-specific guidance stays
Generic codebase-memory assets move into `pi-codebase-memory`, including the generic codebase-memory skill and any generic raw-discovery reminder behavior. `pi-mimir` retains only OpenSpec-specific workflow guidance that tells agents to use codebase-memory first and to report degraded discovery when unavailable.

**Why:** the distinction keeps shared codebase-memory behavior reusable while preserving the OpenSpec-specific workflow contract inside `pi-mimir`.

**Alternative considered:** leave the generic skill and reminder logic in `pi-mimir`. Rejected because those assets are not specific to OpenSpec and would leave the split incomplete.

### Decision 5: Tests and docs split along the same boundary
Tests move with the ownership boundary:

- `pi-codebase-memory` tests cover MCP setup/config ownership and generic assets
- `pi-mimir` tests cover capability checks, incomplete setup reporting, exact install guidance, and degraded-discovery messaging

Documentation follows the same split: `pi-codebase-memory` documents installation/setup, while `pi-mimir` documents that the plugin is required for full setup.

**Why:** ownership-aligned tests reduce ambiguity and make failures easier to localize.

## Risks / Trade-offs

- **Package boundary drift** → Mitigation: move all MCP/binary/config code out of `pi-mimir` and keep only tool-availability checks there.
- **False success when plugin is installed but inactive** → Mitigation: treat `codebase_memory_*` tool availability as the source of truth.
- **User confusion from partial setup** → Mitigation: make the final init/update report explicitly say setup is incomplete and show the exact install command.
- **Behavior split across two packages increases maintenance overhead** → Mitigation: keep the contract small and explicit: plugin owns integration, workflow package owns capability usage and messaging.

## Migration Plan

1. Create `packages/pi-codebase-memory/` as a standalone Pi package.
2. Move codebase-memory-specific runtime logic, packaged assets, and tests into the new package.
3. Remove bundled `codebase-memory-mcp` ownership and MCP mutation logic from `packages/pi-mimir`.
4. Replace `pi-mimir` setup checks with capability-based readiness checks and incomplete-setup reporting.
5. Update init/update/session messaging to use the exact install command `pi install @casualjim/pi-codebase-memory`.
6. Update READMEs and package metadata to reflect the separate-install model.
7. Run package and workflow tests for both workspace packages.

## Open Questions

None.
