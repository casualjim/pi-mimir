# pi-openspec

OpenSpec workflow package for Pi. `@casualjim/pi-openspec` adds a review-gated OpenSpec workflow with focused planning, implementation, and planning-review entrypoints.

## What it provides

- `plan` — run the full OpenSpec planning workflow, composing generated proposal/spec/design/task behavior with one holistic planning review.
- `implement` — run generated OpenSpec apply behavior, verify it, and stop before archive; implementation review remains a separate explicit action.
- `review-plan` — run a standalone planning review over existing planning artifacts.
- Optional handoff to standalone `@casualjim/pi-review` for implementation review when installed.
- A `review-gated` OpenSpec schema and supporting templates.
- Session guidance for codebase-memory-first discovery.
- Explicit incomplete-setup reporting when the separate `pi-codebase-memory` plugin is not active.
- Compatibility with the sibling `@casualjim/pi-advisor` package for forked child advisor consultations.

`@casualjim/pi-openspec` does not commit, push, create pull requests, archive changes, or run branch-finishing workflows. Generated OpenSpec skills are allowed to coexist and may be called by the full workflow where appropriate.

## Install

Install the package in Pi, then initialize it in the target repository:

```text
/openspec:init
```

The init command:

1. runs `openspec init --tools pi`,
2. configures `openspec/config.yaml` to use the `review-gated` schema,
3. syncs bundled OpenSpec schemas/project-state assets,
4. keeps bundled skills package-provided and syncs OpenSpec agents into `~/.pi/agent/agents`,
5. checks whether the required `codebase_memory_*` tools are active, and
6. reports setup as incomplete with an install command when `pi-codebase-memory` is not yet active.

To refresh OpenSpec Pi tooling later, run:

```text
/openspec:update
```

The update command runs `openspec update`, keeps `openspec/config.yaml` on the `review-gated` schema, syncs bundled schemas/project-state assets, prunes legacy copied skills/agents when safe, writes OpenSpec agent ownership to `~/.pi/agent/mimir-managed.json`, and refreshes `.pi/mimir-managed.json` for project OpenSpec assets only.

## Requirements

- Pi with package support.
- OpenSpec CLI 1.4.1 available as `openspec`.
- [`@casualjim/pi-codebase-memory`](../pi-codebase-memory/README.md) installed in Pi for full architecture-aware discovery.

Install codebase-memory support with:

```text
pi install npm:@casualjim/pi-codebase-memory
```

Without that plugin active, workflows can still use exact file reads and shell inspection, but should report discovery as degraded and avoid claiming architecture-aware analysis.

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

Use this only after the change is apply-ready. The workflow applies implementation work, verifies it against planning artifacts, and stops before archive. Run standalone `@casualjim/pi-review` only when you explicitly want separate implementation review findings.

### Run planning review directly

```text
/skill:review-plan <change-name>
```

Use this when planning artifacts already exist and you want a separate planning review pass. `review-plan` expects OpenSpec planning artifacts. Findings are returned inline by default as structured reports with a summary, issues grouped by priority, and a final assessment; the review is intended to be single-shot, so after reported findings are addressed a follow-up review over unchanged material should ideally report only net new issues introduced by the changes or made newly reviewable by newly supplied evidence. Only persist findings when you explicitly ask.

For whole-tree implementation review, install and use standalone `@casualjim/pi-review`:

```text
/skill:review-implementation [review-scope]
```

## Discovery behavior

For code discovery, `@casualjim/pi-openspec` guides agents toward this ladder:

1. `codebase_memory_get_architecture`
2. `codebase_memory_search_graph` or `codebase_memory_search_code`
3. `codebase_memory_trace_path`
4. `codebase_memory_get_code_snippet`
5. exact file reads or shell inspection when appropriate
6. synthesis

The runtime sends a non-blocking one-shot reminder on broad raw discovery tools such as `grep`, `find`, or `ls`. It does not block those calls and does not gate `read`; agents should always read files before editing them.

## Review skills

`review-plan` is the package-owned standalone review entrypoint. It returns the whole actionable issue list inline by default and is intended to be single-shot rather than staged across repeated rounds; wording-only or editorial comments with no meaningful outcome change are suppressed. Persist findings only when explicitly asked.

`plan` uses a single consolidated planning reviewer. It does not fan out into artifact-specific planning review skills during the default workflow.

Implementation review and manual deep dives live in standalone `@casualjim/pi-review`:

- `review-implementation`
- `review-architecture`
- `review-tests`
- `review-data-flow`
- `review-security`

Planning review findings identify the target artifact, any upstream artifact that must be fixed first, and whether a user decision is required instead of guessing. They are intended to focus on substantive implementation readiness rather than minute wording polish.

Review findings use these severities:

- `blocker` — must be fixed before proceeding.
- `concern` — fix or ask the user to explicitly accept.
- `suggestion` — optional improvement.

## Development

Run tests from `packages/pi-openspec`:

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
