# pi-mimir

OpenSpec workflow package for Pi. `pi-mimir` adds a review-gated OpenSpec workflow with focused planning, implementation, and review entrypoints.

## What it provides

- `plan` — create or refine an OpenSpec change through proposal, specs, design, tasks, and planning review gates.
- `implement` — apply an implementation-ready OpenSpec change, verify it, run implementation review gates, and stop before archive.
- `review-plan` — run proposal, design, specs, and tasks review gates for existing planning artifacts.
- `review-implementation` — run architecture, tests, performance, and security review gates for existing implementation evidence.
- A `review-gated` OpenSpec schema and supporting templates.
- Session guidance for codebase-memory-first discovery.

`pi-mimir` does not commit, push, create pull requests, archive changes, or run branch-finishing workflows. Use generated OpenSpec sync/archive behavior explicitly when you want those actions.

## Install

Install the package in Pi, then initialize it in the target repository:

```text
/openspec:init
```

The init command:

1. runs `openspec init --tools pi`,
2. configures `openspec/config.yaml` to use the `review-gated` schema,
3. syncs bundled schemas, skills, and agents,
4. checks the `pi-mcp-adapter` bridge, and
5. checks for codebase-memory MCP configuration.

If bundled agents or OpenSpec assets drift later, run:

```text
/openspec-update-agents
```

## Requirements

- Pi with package support.
- OpenSpec CLI available as `openspec`.
- [codebase-memory MCP](https://github.com/DeusData/codebase-memory-mcp) for full architecture-aware discovery.
- `pi-mcp-adapter` when exposing MCP tools directly to Pi.

Without codebase-memory, workflows can still use exact file reads and shell inspection, but should report discovery as degraded and avoid claiming architecture-aware analysis.

## Usage

### Plan a change

```text
/skill:plan <change-name>
```

Use this for proposal/spec/design/task planning. The planner uses OpenSpec status and instructions as source of truth, asks clarifying questions when intent is ambiguous, performs codebase-memory-first discovery when code context is needed, and runs planning review gates before implementation readiness.

### Implement a change

```text
/skill:implement <change-name>
```

Use this only after the change is apply-ready. The worker reads OpenSpec apply instructions and tracked tasks, invokes the generated apply behavior, verifies the implementation against planning artifacts, runs implementation review gates, and stops before archive.

### Run review gates directly

```text
/skill:review-plan <change-name>
/skill:review-implementation <change-name>
```

Use these when planning or implementation already exists and you only want the review gate workflow.

## Discovery behavior

For code discovery, `pi-mimir` guides agents toward this ladder:

1. `codebase_memory_get_architecture`
2. `codebase_memory_search_graph` or `codebase_memory_search_code`
3. `codebase_memory_trace_path`
4. `codebase_memory_get_code_snippet`
5. exact file reads or shell inspection when appropriate
6. synthesis

The runtime sends a non-blocking one-shot reminder on broad raw discovery tools such as `grep`, `find`, or `ls`. It does not block those calls and does not gate `read`; agents should always read files before editing them.

## Review gates

Planning review gates:

- `review-proposal`
- `review-design`
- `review-specs`
- `review-tasks`

Implementation review gates:

- `review-architecture`
- `review-tests`
- `review-performance`
- `review-security`

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
