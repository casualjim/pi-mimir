# pi-openspec-workflow — Revised Architecture Plan

Standalone Pi package for OpenSpec-native development.

This package provides an OpenSpec-first workflow for Pi. OpenSpec owns workflow artifacts, codebase-memory owns codebase understanding, review skills own gate behavior, a generic reviewer persona supplies review stance, and orchestrator agents steer the two user-facing phases. The package does **not** depend on `rpiv-pi` and does **not** add commit management.

## Purpose

Make OpenSpec feel native inside Pi while avoiding the failure mode of generic, agent-heavy planning workflows.

The package should help an agent:

- define an OpenSpec change through exploration, proposal, specs, and design;
- use codebase-memory directly for discovery, tracing, architecture lookup, and pattern lookup;
- review OpenSpec artifacts before implementation;
- deliver an apply-ready change through task execution, verification, and specialist review;
- stop at archive readiness without committing.

## Hard Constraints / Non-Goals

- **No `@juicesharp/rpiv-pi` dependency.** This package must work when rpiv-pi is not installed.
- **No commit skill or commit workflow.** Commits are outside this package's scope.
- **No generic rpiv-pi-style workflow skills.** Do not register generic `research`, `design`, `plan`, `blueprint`, `implement`, `validate`, `review`, or `commit` skills.
- **No discovery subagent fan-out.** Ordinary codebase discovery must use codebase-memory tools first.
- **No rpiv-pi workflow clone.** The package should not recreate `discover → research → design → plan → implement → validate` under new names.
- **No competing architecture truth.** OpenSpec artifacts, codebase-memory ADR, and optional path-scoped guidance must have distinct ownership.

If rpiv-pi or overlapping rpiv-pi skills are installed, the extension should warn that generic skills may steer the agent into the wrong workflow.

## Core Principles

| Principle | Owner | Meaning |
|---|---|---|
| Workflow artifacts | OpenSpec | Proposal, specs, design, tasks, sync, archive |
| Codebase understanding | codebase-memory | Search, trace, architecture overview, snippets, impact |
| Phase steering | Orchestrator agents | Definition and delivery coordination |
| Review judgment | Reviewer agents | Artifact gates, claim verification, specialist implementation review |
| Pi ergonomics | Extension + skills/prompts | Session guidance, setup, generated prompt/skill integration |

## Workflow

```text
Definition phase
  explore
    ↓
  proposal / specs / design
    ↓
  artifact review gate
    ↓
  apply-ready change

Delivery phase
  apply tasks
    ↓
  verify against OpenSpec artifacts
    ↓
  specialist implementation review gate
    ↓
  archive-ready change
```

There is intentionally no commit phase.

### Definition Phase

Purpose: turn an idea into reviewed OpenSpec artifacts.

```text
explore → proposal/specs/design → proposal/specs/design review → ready for delivery
```

The definition phase:

- supports exploratory conversation;
- uses codebase-memory for codebase investigation;
- creates or continues OpenSpec changes through `openspec` CLI instructions;
- writes proposal, specs, and design artifacts according to the active OpenSpec schema;
- dispatches artifact reviewers after artifacts are complete;
- loops on reviewer findings until artifacts are ready;
- refuses application-code implementation.

### Delivery Phase

Purpose: implement an apply-ready OpenSpec change and review the result.

```text
apply → verify → architecture/tests/performance/security review → archive-ready
```

The delivery phase:

- reads OpenSpec apply instructions;
- reads all required context files;
- applies tasks incrementally and marks them complete only when done;
- verifies implementation against proposal, specs, design, and tasks;
- runs specialist implementation reviewers after verification;
- loops on fixes when verification or review fails;
- stops when the change is ready to archive;
- does not commit.

## User-Facing Surface

Prefer a small OpenSpec-specific surface over many generic skills.

```text
skills/
├── define/
│   └── SKILL.md
├── deliver/
│   └── SKILL.md
└── # archive/sync uses expanded OpenSpec-generated workflow instructions, not a wrapper skill
```

### `define`

Backed by `planner`.

Responsibilities:

- explore the change with the user;
- use codebase-memory-first discovery;
- create or continue OpenSpec artifacts;
- dispatch proposal/specs/design/tasks reviewers;
- synthesize review findings;
- update artifacts or ask for decisions;
- stop when the change is apply-ready.

### `deliver`

Backed by `worker`.

Responsibilities:

- select or accept an apply-ready change;
- execute pending tasks from the OpenSpec tracked task file;
- verify implementation against artifacts;
- dispatch claim and specialist implementation reviewers;
- synthesize findings and loop on fixes;
- stop at archive-ready.

### Archive

Archive should reuse OpenSpec's generated archive workflow directly. Package-specific behavior belongs in expanded archive/sync instructions, schema/config rules, or generated OpenSpec workflow content rather than a wrapper skill. It must not commit.

## OpenSpec Integration

Do not reimplement OpenSpec's workflow engine. Use OpenSpec's schema/profile/config model and generated instructions.

Core commands used by orchestrators:

```bash
openspec list --json
openspec status --change <name> --json
openspec instructions <artifact-id> --change <name> --json
openspec instructions apply --change <name> --json
openspec validate <name> --strict
```

Customization should happen through:

- project-local schemas in `openspec/schemas/<name>/schema.yaml`;
- artifact `instruction` fields;
- artifact templates;
- `apply.instruction`;
- `openspec/config.yaml` context and per-artifact rules;
- generated Pi prompts/skills where reuse is appropriate.

OpenSpec artifacts remain canonical in:

```text
openspec/changes/<change>/proposal.md
openspec/changes/<change>/specs/**/spec.md
openspec/changes/<change>/design.md
openspec/changes/<change>/tasks.md
```

## Codebase-Memory-First Discovery

Codebase discovery should be direct and tool-based, not subagent fan-out.

Preferred ladder:

| Need | Tool |
|---|---|
| Architecture overview | `codebase_memory_get_architecture` |
| Find definitions, classes, routes, symbols | `codebase_memory_search_graph` |
| Search text with graph context | `codebase_memory_search_code` |
| Trace callers/callees/data flow/cross-service paths | `codebase_memory_trace_path` |
| Read known symbol source | `codebase_memory_get_code_snippet` |
| Complex multi-hop graph questions | `codebase_memory_query_graph` |
| Read exact known files | `read` |

Decision rule:

```text
Use codebase-memory for discovery.
Use subagents for judgment gates.
```

Subagents are allowed for:

- proposal/specs/design/tasks artifact review;
- claim verification;
- specialist implementation review;
- exceptional cases where codebase-memory and direct reads cannot answer the question.

Subagents are not the default for:

- locating definitions;
- finding callers;
- tracing data flow;
- mapping architecture;
- finding existing implementation patterns;
- basic codebase research.

## Orchestrator Agents

```text
agents/
├── planner.md
└── worker.md
```

### `planner`

Execution contract:

- Owns definition phase only.
- Uses OpenSpec CLI for change status and artifact instructions.
- Uses codebase-memory tools directly for investigation.
- Does not write application code.
- Does not dispatch research fan-out agents.
- Dispatches proposal/specs/design/tasks reviewers only after artifacts are ready.
- Synthesizes reviewer findings and updates artifacts or asks user decisions.

### `worker`

Execution contract:

- Owns delivery phase only.
- Uses OpenSpec apply instructions for task context and tracking.
- Reads proposal, specs, design, and tasks before implementation.
- Applies tasks incrementally.
- Verifies implementation against artifacts.
- Dispatches claim verifier and specialist implementation reviewers after verification.
- Loops on fixes when gates fail.
- Stops at archive-ready.
- Never commits.

## Review Skills and Reviewer Persona

Review gates are deliberately scoped gatekeepers, not discovery workers. The package should not create one specialized agent persona per review dimension. Instead, review behavior lives in skills/prompts, and a single generic reviewer persona agent supplies the adversarial review stance.

```text
skills/
├── review-proposal/
├── review-specs/
├── review-design/
├── review-tasks/
├── review-claims/
├── review-architecture/
├── review-tests/
├── review-performance/
└── review-security/

agents/
└── reviewer.md
```

### Artifact Review Gate

Runs during definition after proposal/specs/design/tasks are generated.

| Review skill | Checks |
|---|---|
| `review-proposal` | WHY/WHAT focus, clear scope, stakeholder readability, impact, no implementation leakage |
| `review-specs` | Testable requirements, scenario coverage, proposal coverage, no design/task leakage |
| `review-design` | HOW decisions, rationale, tradeoffs, risks, consistency with specs/proposal, no task-level over-detail |
| `review-tasks` | Ordered granular steps, maps to specs/design, implementable without ambiguity |

### Verification and Specialist Implementation Gate

Runs during delivery after tasks are complete.

```text
OpenSpec artifacts + implementation
  ↓
claim review
  ↓
architecture / tests / performance / security review skills
  ↓
fix loop or archive-ready
```

| Review skill | Checks |
|---|---|
| `review-claims` | Completeness, correctness, coherence against proposal/specs/design/tasks |
| `review-architecture` | Cohesion, coupling, layering, integration consistency |
| `review-tests` | Coverage gaps, critical scenarios, regression risk, test quality |
| `review-performance` | Hot paths, allocation/scaling risks, resource leaks, N+1 patterns |
| `review-security` | Trust boundaries, auth, input validation, secret exposure, risky sinks |

Review skill output must be grounded and actionable: severity, location, problem, impact, and fix. The generic reviewer persona follows the skill's rules rather than carrying all specialist rules in its agent profile.

## Architecture Memory Boundaries

Avoid maintaining competing architecture stores.

| Surface | Ownership |
|---|---|
| OpenSpec artifacts | Change-scoped truth: proposal, specs, design, tasks |
| codebase-memory ADR | Durable project-level architecture, stack, conventions, tradeoffs |
| Path-scoped guidance | Optional local file-touch conventions only if ADR is insufficient |

Rules:

- Keep OpenSpec artifacts canonical for active and archived changes.
- Use codebase-memory ADR for architecture knowledge that should outlive one change.
- Update or recommend ADR updates after a change has landed, as part of spec sync/archive guidance.
- Prefer references from ADR to OpenSpec artifacts over duplicating full content.
- Treat path-scoped guidance as optional; if ADR provides reliable context, generated guidance may be unnecessary.
- Do not let `.rpiv/guidance`, `.codebase-memory/adr.md`, and OpenSpec design docs all become full copies of the same information.

## Extension Responsibilities

The extension should provide Pi ergonomics without becoming the workflow engine.

Responsibilities:

- inject OpenSpec + codebase-memory-first guidance;
- inject git context if useful;
- warn about rpiv-pi overlap;
- scaffold expected directories if needed;
- sync bundled orchestrator agents and the generic reviewer persona if this package owns them;
- track package/OpenSpec/asset versions in generated-file manifests;
- integrate with OpenSpec-generated prompts/skills where appropriate;
- ensure setup covers required Pi packages, OpenSpec CLI, codebase-memory MCP, and MCP adapter;
- show a copy-paste setup prompt when codebase-memory MCP is missing;
- keep public names concise and product-facing instead of literal implementation labels;
- avoid registering generic rpiv-pi-style workflow names.

Potential commands:

| Command | Description |
|---|---|
| `/openspec-setup` | Install/check Pi siblings, OpenSpec CLI, codebase-memory MCP, MCP adapter, and package schema/config; shows copy-paste codebase-memory setup prompt when needed |
| `/openspec-update-agents` | Sync orchestrator agents and generic reviewer persona using versioned manifest metadata |
| `/openspec-check-overlap` | Report installed rpiv-pi or generic overlapping skills |

## Revised Package Structure

```text
pi-openspec-workflow/
├── package.json
├── PLAN.md
├── README.md
│
├── extensions/
│   └── openspec-core/
│       ├── index.ts
│       ├── bootstrap.ts              # OpenSpec + codebase-memory-first injection
│       ├── session-hooks.ts
│       ├── git-context.ts
│       ├── guidance.ts               # optional path-scoped guidance injection
│       ├── agents.ts                 # sync orchestrators + generic reviewer persona
│       ├── managed-manifest.ts       # package/OpenSpec/asset version markers
│       ├── setup-command.ts          # installs/checks siblings, openspec, codebase-memory
│       ├── update-agents.ts
│       ├── overlap-checks.ts         # detect rpiv-pi/generic skill overlap
│       └── constants.ts
│
├── skills/
│   ├── define/
│   │   └── SKILL.md
│   ├── deliver/
│   │   └── SKILL.md
│   ├── review-proposal/
│   │   └── SKILL.md
│   ├── review-specs/
│   │   └── SKILL.md
│   ├── review-design/
│   │   └── SKILL.md
│   ├── review-tasks/
│   │   └── SKILL.md
│   ├── review-claims/
│   │   └── SKILL.md
│   ├── review-architecture/
│   │   └── SKILL.md
│   ├── review-tests/
│   │   └── SKILL.md
│   ├── review-performance/
│   │   └── SKILL.md
│   └── review-security/
│       └── SKILL.md
│   # archive/sync behavior comes from expanded OpenSpec-generated workflow instructions
│
├── agents/
│   ├── planner.md
│   ├── worker.md
│   └── reviewer.md
│
├── openspec/
│   └── schemas/
│       └── review-gated/
│           ├── schema.yaml
│           └── templates/
│               ├── proposal.md
│               ├── spec.md
│               ├── design.md
│               └── tasks.md
│
└── docs/
    ├── workflow.md
    ├── codebase-memory.md
    └── architecture-memory.md
```

## Implementation Order

### Phase 1: OpenSpec Workflow Surface and Setup

1. Register the `define` and `deliver` skill surface.
2. Reuse OpenSpec archive behavior without adding an archive wrapper skill.
3. Ensure no commit or generic planning skills are registered.
4. Ensure no `@juicesharp/rpiv-pi` dependency is introduced.
5. Add `rpiv-btw` and `npm:pi-mcp-adapter` to the sibling registry.
6. Extend setup to ensure OpenSpec CLI availability with `npm i -g @FissionAI/openspec` when missing.
7. Extend setup to check codebase-memory MCP availability and show a copy-paste setup prompt when missing.
8. Add overlap detection or warning for rpiv-pi/generic skills.

### Phase 2: Planner and Worker

9. Add the `planner` agent for definition.
10. Add the `worker` agent for delivery.
11. Ensure both agents use OpenSpec CLI status/instructions.
12. Ensure both agents use codebase-memory-first discovery.
13. Ensure both agents prohibit commit execution.

### Phase 3: Review Skills and Reviewer Persona

14. Add the generic reviewer persona agent.
15. Add proposal/specs/design/tasks review skills.
16. Add claim, architecture, tests, performance, and security review skills.
17. Define a consistent grounded finding format.
18. Define planner/worker synthesis and fix-loop behavior.

### Phase 4: Codebase-Memory and OpenSpec Assets

19. Add codebase-memory-first guidance to bootstrap/context injection.
20. Define fallback behavior when codebase-memory is unavailable or stale.
21. Add review-gated OpenSpec schema/profile/config assets.
22. Add expanded spec sync/archive guidance for post-landing ADR handling.
23. Define architecture memory boundaries across OpenSpec artifacts, codebase-memory ADR, and optional guidance.

### Phase 5: Naming, Manifest, Documentation, and Validation

24. Run the final naming pass for public skills, prompts, commands, agents, and schema/profile names.
25. Upgrade generated-file manifests with package/OpenSpec/asset version markers.
26. Update README usage docs with final product names.
27. Add tests for setup detection, manifest drift, overlap warnings, package registration, no commit workflow, and no rpiv-pi dependency.
28. Validate the OpenSpec change.
