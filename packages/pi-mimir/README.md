# pi-mimir

OpenSpec workflow package for Pi. `pi-mimir` adds a review-gated OpenSpec workflow with focused planning, implementation, and review entrypoints.

## What it provides

- `plan` — run the full OpenSpec planning workflow, composing generated proposal/spec/design/task behavior with one holistic planning review.
- `implement` — run generated OpenSpec apply behavior, verify it, and stop before archive; implementation review remains a separate explicit action.
- `review-plan` — run a standalone planning review over existing planning artifacts.
- `review-implementation` — run a standalone implementation review over existing implementation evidence.
- A `review-gated` OpenSpec schema and supporting templates.
- Session guidance for codebase-memory-first discovery.

`pi-mimir` does not commit, push, create pull requests, archive changes, or run branch-finishing workflows. Generated OpenSpec skills are allowed to coexist and may be called by the full workflow where appropriate.

## Install

Install the package in Pi, then initialize it in the target repository:

```text
/openspec:init
```

The init command:

1. runs `openspec init --tools pi`,
2. configures `openspec/config.yaml` to use the `review-gated` schema,
3. syncs bundled schemas, skills, and agents,
4. configures the bundled `codebase-memory-mcp` server when no existing codebase-memory MCP server is present, and
5. keeps existing codebase-memory MCP configuration unchanged when already present.

To refresh OpenSpec Pi tooling later, run:

```text
/openspec:update
```

The update command runs `openspec update`, keeps `openspec/config.yaml` on the `review-gated` schema, syncs bundled schemas, skills, agents, and refreshes `.pi/mimir-managed.json`.

## Requirements

- Pi with package support.
- OpenSpec CLI available as `openspec`.
- Bundled [codebase-memory MCP](https://github.com/DeusData/codebase-memory-mcp) for full architecture-aware discovery.
- `pi-mcp-adapter` compatibility is retained; existing codebase-memory MCP server definitions are preserved.

Without codebase-memory, workflows can still use exact file reads and shell inspection, but should report discovery as degraded and avoid claiming architecture-aware analysis.

## Usage

### Plan a change

```text
/skill:plan <change-name>
```

Use this for the composed planning workflow: propose planning artifacts, run one holistic planning review, and iterate with targeted artifact fixes until blockers and concerns are resolved.

### Implement a change

```text
/skill:implement <change-name>
```

Use this only after the change is apply-ready. The workflow applies implementation work, verifies it against planning artifacts, and stops before archive. Run `review-implementation` only when you explicitly want separate review findings.

### Run reviews directly

```text
/skill:review-plan <change-name>
/skill:review-implementation <change-name>
```

Use these when planning or implementation already exists and you want a separate review pass. Findings are returned inline by default as structured reports with a summary, issues grouped by priority, and a final assessment; the review is intended to be single-shot, so after reported findings are addressed a follow-up review over unchanged material should ideally report only net new issues introduced by the changes or made newly reviewable by newly supplied evidence. Only persist findings when you explicitly ask.

## Discovery behavior

For code discovery, `pi-mimir` guides agents toward this ladder:

1. `codebase_memory_get_architecture`
2. `codebase_memory_search_graph` or `codebase_memory_search_code`
3. `codebase_memory_trace_path`
4. `codebase_memory_get_code_snippet`
5. exact file reads or shell inspection when appropriate
6. synthesis

The runtime sends a non-blocking one-shot reminder on broad raw discovery tools such as `grep`, `find`, or `ls`. It does not block those calls and does not gate `read`; agents should always read files before editing them.

## Review skills

`review-plan` and `review-implementation` are the default standalone review entrypoints. They return the whole actionable issue list inline by default and are intended to be single-shot rather than staged across repeated rounds; persist findings only when explicitly asked.

`plan` uses a single consolidated planning reviewer. It does not fan out into artifact-specific planning review skills during the default workflow.

Manual implementation deep dives:

- `review-architecture`
- `review-tests`
- `review-data-flow`
- `review-security`

The narrower `review-*` skills are opt-in deep dives, not automatic workflow steps.

Planning review findings identify the target artifact, any upstream artifact that must be fixed first, and whether a user decision is required instead of guessing.

Review findings use these severities:

- `blocker` — must be fixed before proceeding.
- `concern` — fix or ask the user to explicitly accept.
- `suggestion` — optional improvement.

## Development

Run tests from `packages/pi-mimir`:

```bash
npm test
npm run typecheck
```

Run the integration workflow test with:

```bash
npm run test:e2e
```

Set `E2E_MODEL` to choose the model used by the non-interactive Pi sessions.

## License

MIT
