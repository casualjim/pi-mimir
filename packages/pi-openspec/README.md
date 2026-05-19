# pi-openspec

OpenSpec-native workflow package for Pi. The primary workflow entry points are intentionally small:

- `plan` — plan or refine an OpenSpec change through proposal, specs, design, tasks, and artifact review gates.
- `implement` — implement an apply-ready OpenSpec change, verify it, run implementation review gates, and stop before explicit archive.
- `review-plan` — independently run proposal/specs/design/tasks review gates for existing OpenSpec planning artifacts.
- `review-implementation` — independently run claim/architecture/tests/performance/security review gates for existing implementation evidence.

The package also registers lower-level `review-*` gate skills so orchestrators and explicit review workflows can invoke the generic reviewer persona with artifact- or implementation-specific rubrics. Review skills are explicit OpenSpec gates, not ambient replacements for all planning, design, or code review requests. Archive and sync use OpenSpec-generated behavior. This package does not provide a commit workflow.

## Setup

Run:

```bash
/openspec-setup
```

The setup command checks or installs these prerequisites:

- Pi sibling packages: `@tintinweb/pi-subagents`, `@juicesharp/rpiv-ask-user-question`, `@juicesharp/rpiv-todo`, `@juicesharp/rpiv-web-tools`, `@juicesharp/rpiv-args`, `@juicesharp/rpiv-btw`, and `pi-mcp-adapter`.
- OpenSpec CLI availability. If missing, setup reports: `npm i -g @FissionAI/openspec`.
- codebase-memory MCP availability from `~/.pi/agent/mcp.json`. Pi package detection still uses `~/.pi/agent/settings.json`; MCP server detection does not.

If codebase-memory MCP tools are missing, setup displays this copy-paste prompt:

> Install and configure codebase-memory MCP for this Pi project through pi-mcp-adapter. After setup, verify tools such as codebase_memory_get_architecture, codebase_memory_search_graph, codebase_memory_search_code, codebase_memory_trace_path, and codebase_memory_get_code_snippet are available.

The package does not silently perform complex external codebase-memory installation unless a future version bundles that installer.

## Workflow

### Preferred entrypoints and generated skill coexistence

Use `plan` and `implement` for this package's orchestrated review-gated workflow. Use `review-plan` or `review-implementation` when you want the review gates as a separate workflow after `openspec-propose`, `openspec-apply-change`, or manual changes. Generated OpenSpec `/opsx:*` or `openspec-*` skills may still be present; they are not hidden or broken. Use generated skills explicitly for sync/archive or schema-generated actions when needed, but avoid contradictory instructions that route the same change through a separate generic planning pipeline.

If rpiv-pi, pi-superpowers, or broad generated workflow skills are installed, the extension warns that they may over-trigger or steer a conflicting workflow and names `plan`/`implement` as the preferred OpenSpec-native entrypoints.

### Plan

Use `plan <change>` to route planning-phase work through the planner agent. The planner uses OpenSpec status/instructions, asks intent-first clarification before codebase probing when the outcome is ambiguous, reads dependency artifacts, discovers codebase context with codebase-memory first, and runs proposal/specs/design/tasks review gates before declaring implementation readiness. It never writes application code.

### Implement

Use `implement <change>` to route implementation through the worker agent. The worker reads OpenSpec apply instructions and tracked tasks as source of truth, invokes an isolated `apply` agent that does not inherit context and whose prompt starts with `/skill:openspec-apply-change <change>`, verifies against artifacts, runs claim/architecture/tests/performance/security review gates after verification, and stops when the change is ready to archive. It never commits, pushes, creates PRs, archives directly, or runs Superpowers finishing-branch behavior.

## Agent invocation contract

Every invoked OpenSpec skill agent prompt must start exactly with:

```text
/skill:<openspec-skill-name> <change-name>
```

Extra instructions may follow on later lines only. Planning and plan-verification subagents inherit active context. Explore is not a subagent phase; the explore agent has codebase-memory tools plus `web_search` and `web_fetch`. Apply is isolated and does not inherit context.

## Discovery ladder

Orchestrators use this codebase-memory-first ladder:

1. `codebase_memory_get_architecture`
2. `codebase_memory_search_graph` or `codebase_memory_search_code`
3. `codebase_memory_trace_path`
4. `codebase_memory_get_code_snippet`
5. exact file reads
6. direct synthesis
7. reviewer persona only at explicit review gates

Stop discovery once likely affected capabilities, impact areas, relevant existing specs, and major implementation constraints are known. Do not create durable `research.md` or `thoughts/shared` research artifacts by default unless the active OpenSpec schema defines one or the user explicitly asks.

When codebase-memory is unavailable or stale, orchestrators report degraded discovery and fall back to exact file reads or shell inspection without claiming architecture-aware discovery.

## Review workflows and gates

Independent review workflows:

- `review-plan` orchestrates the schema-owned planning review artifacts: `reviews/proposal.md`, `reviews/specs.md`, `reviews/design.md`, and `reviews/tasks.md`.
- `review-implementation` orchestrates the schema-owned implementation review artifacts: `reviews/claims.md`, `reviews/architecture.md`, `reviews/tests.md`, `reviews/performance.md`, and `reviews/security.md`.

Archive remains owned by generated OpenSpec archive behavior. The review-gated schema does not create an archive artifact or archive template; the final implementation review reports whether explicit archive can be run separately.

Artifact review gate skills: `review-proposal`, `review-specs`, `review-design`, `review-tasks`.

Implementation review gate skills: `review-claims`, `review-architecture`, `review-tests`, `review-performance`, `review-security`.

All findings use a grounded actionable format with severity, location, evidence, problem, impact, and recommended fix. Severity semantics:

- `blocker`: must be fixed before proceeding.
- `concern`: fix or ask the user to accept explicitly.
- `suggestion`: optional improvement.

Claim verification uses `Verified`, `Weakened`, or `Falsified` with evidence. Orchestrators deduplicate review findings and act on the highest-severity actionable set.

## Source-system lessons

Kept from rpiv-pi:

- intent-first discovery and grounded user questions;
- Developer Context-style propagation of important decisions;
- artifact review, slice/review discipline, and severity-tagged gates.

Rejected from rpiv-pi:

- many generic public skills such as `research`, `design`, `validate`, and `review`; `plan` and `implement` are kept only as narrow OpenSpec-specific package entrypoints;
- a competing `thoughts/shared` artifact store for normal OpenSpec changes;
- default broad subagent fan-out for ordinary discovery;
- commit/review workflow coupling.

Kept from pi-superpowers:

- explicit phase transitions, phase monitor-style guardrails, and disciplined verification/review before completion.

Rejected from pi-superpowers:

- broad trigger text, long vague skills, default `docs/specs` and `docs/plans` paths, and commit/PR/finishing-branch assumptions.

Kept from superpowers-bridge:

- valid complex OpenSpec DAG mechanics, inline artifact/apply instructions, fail-loud prechecks, output redirection patterns, and durable post-apply artifacts when modeled as OpenSpec artifact nodes.

Rejected from superpowers-bridge:

- Superpowers-specific names, docs paths, and finishing behavior in this package's review-gated workflow.

## Architecture memory ownership

OpenSpec artifacts in `openspec/changes/**` are canonical for change-scoped proposal, requirement, design, and task information.

codebase-memory ADR owns durable project-level architecture summaries and conventions. ADR updates happen after landed changes during sync/archive guidance.

Path-scoped guidance is optional. After validating the ADR ownership model for this change, the package keeps path guidance optional rather than required; use it only for subtree-local conventions not adequately captured by ADR.

## Integration tests

Run unit tests with:

```bash
npm test
```

Run the real Pi workflow integration test with:

```bash
npm run test:e2e
```

The E2E test installs this package into an isolated Pi home, starts real `pi` non-interactive sessions, verifies workflow guidance injection, and invokes `review-plan` / `review-implementation` skill workflows. Set `E2E_MODEL` to choose a cheap configured model; the default is `zai/glm-5-turbo`.

A Docker runner is available at `tests/integration/docker/Dockerfile` for CI environments that install Pi inside the container.

## Managed manifests

Agents remain content-addressable: `.openspec-managed.json` maps managed agent filenames to content hashes. Skills and prompts should follow the same content-addressable model when copied by future sync logic. OpenSpec schema/config/generated assets use `.openspec-assets-managed.json`, which adds OpenSpec/source asset version metadata because those generated assets may depend on non-content-addressable generation inputs.
