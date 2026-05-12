# pi-openspec-workflow — Architecture Plan

OpenSpec-driven development workflow for Pi Agent. Uses codebase-memory queries instead of heavy agent fan-outs, adversarial review gates for artifacts and code, and language-specific rule packs.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  Extension (bootstrap)                                    │
│  before_agent_start → injects codebase-memory awareness   │
│                       + openspec skill awareness           │
│                       + companion package checks           │
│  session_start → sync agents, git context, guidance       │
│  /openspec-setup → install sibling packages               │
├──────────────────────────────────────────────────────────┤
│  Skills (7)                                               │
│  explore → propose → apply → verify → review → commit     │
│  + continue-change                                        │
├──────────────────────────────────────────────────────────┤
│  Agents (6)                                               │
│  artifact-reviewer ×4 prompts  |  claim-verifier          │
│  architecture-reviewer         |  tests-reviewer          │
│  performance-reviewer          |  security-reviewer       │
└──────────────────────────────────────────────────────────┘
```

## Package Structure

```
pi-openspec-workflow/
├── package.json
├── README.md
│
├── extensions/
│   └── openspec-core/
│       ├── index.ts              # registers hooks + commands + flags
│       ├── bootstrap.ts          # before_agent_start prompt injection
│       ├── session-hooks.ts      # session_start/compact/shutdown lifecycle
│       ├── agents.ts             # sync bundled agents to .pi/agents/
│       ├── setup-command.ts      # /openspec-setup sibling installer
│       ├── update-agents.ts      # /openspec-update-agents command
│       ├── git-context.ts        # cached branch/commit/user injection
│       ├── guidance.ts           # architecture.md injection on file touch
│       ├── constants.ts          # flag names, message types
│       ├── siblings.ts           # peer dependency registry
│       └── package-checks.ts     # detect installed siblings
│
├── skills/
│   ├── explore/
│   │   └── SKILL.md              # thinking partner + codebase-memory research
│   ├── propose/
│   │   └── SKILL.md              # openspec propose + artifact review gate
│   ├── apply/
│   │   └── SKILL.md              # openspec apply (task execution)
│   ├── verify/
│   │   └── SKILL.md              # claim-verifier based verification
│   ├── review/
│   │   └── SKILL.md              # 4-lens parallel code review
│   ├── commit/
│   │   └── SKILL.md              # structured commits
│   └── continue-change/
│       └── SKILL.md              # continue openspec change (artifact-by-artifact)
│
├── agents/                       # 6 agent profiles (Prompt Leverage format)
│   ├── artifact-reviewer.md      # used by propose (4 prompt variants)
│   ├── architecture-reviewer.md  # used by review
│   ├── tests-reviewer.md         # used by review
│   ├── performance-reviewer.md   # used by review
│   ├── security-reviewer.md      # used by review
│   └── claim-verifier.md         # used by verify
│
├── openspec/                     # openspec profile assets
│   └── schemas/
│       └── review-enforced.yaml  # custom schema: spec-driven + artifact review
│
├── rules/                        # Language-specific rule packs
│   ├── rust.md
│   ├── typescript.md
│   ├── python.md
│   └── go.md
│
└── templates/                    # openspec artifact templates
    ├── proposal.md
    ├── spec.md
    ├── design.md
    ├── tasks.md
    └── artifact-review.md
```

## Skills

### explore — replaces rpiv-pi's research + discover + explore

Thinking partner stance (from openspec explore) + codebase-memory for research.

**No agents dispatched.** Uses codebase-memory tools directly:

| Need | Tool |
|---|---|
| Find definitions | `codebase_memory_search_graph` |
| Trace callers/callees | `codebase_memory_trace_path` |
| Read a symbol's source | `codebase_memory_get_code_snippet` |
| Grep with graph context | `codebase_memory_search_code` |
| Architecture overview | `codebase_memory_get_architecture` |
| Complex multi-hop queries | `codebase_memory_query_graph` |

Can transition to `propose` when the user is ready to formalize thinking into a change.

### propose — openspec propose + artifact review gate

Uses `openspec` CLI to scaffold change + generate artifacts (proposal → specs → design → tasks).
Uses codebase-memory for codebase understanding during artifact creation.

After all artifacts are generated, dispatches **artifact-reviewer agent ×4 in parallel**:

| Prompt variant | Checks |
|---|---|
| "Review proposal.md" | WHY/WHAT only, no implementation leakage, clear scope, stakeholder-readable |
| "Review specs/" | Testable requirements (WHEN/THEN), no design decisions, complete coverage |
| "Review design.md" | HOW decisions only, tradeoffs articulated, no task-level detail, consistent with specs |
| "Review tasks.md" | Ordered granular steps, no narrative, maps to specs, implementable without questions |

Each variant also cross-checks against the other 3 artifacts for consistency.

Synthesis: merge findings, fix artifacts, ready for apply.

### apply — openspec apply (task execution)

Straight task execution from `tasks.md`. Reads context files, works through checkboxes, marks `- [ ]` → `- [x]`, pauses on blockers. No agents.

### verify — claim-verifier based verification

After implementation, verifies that the code matches the openspec artifacts.

```
load openspec artifacts (proposal/specs/design/tasks)
        │
  generate claims from each dimension
  ┌─────────────────┐
  │ Completeness     │  tasks done? requirements implemented?
  │ Correctness      │  implementation matches specs? scenarios covered?
  │ Coherence        │  design decisions followed? patterns consistent?
  └─────────────────┘
        │
        ▼
  claim-verifier agent (1 dispatch)
  grounds each claim against actual code
  tags: Verified / Weakened / Falsified
        │
        ▼
  write verification report (scorecard + issues)
```

### review — 4-lens parallel code review

Resolve scope → dispatch 4 agents → deduplicate → calibrate severity → consolidate.

```
resolve scope (branch/diff/staged/working/commit)
        │
   ┌────┼────┬────┐
   ▼    ▼    ▼    ▼
 arch  tests perf  sec
   │    │    │    │
   └────┴────┴────┘
        │
   deduplicate + calibrate severity
        │
   write consolidated report
```

#### Agent prompts (Prompt Leverage format)

Each agent gets a tight execution contract:

**architecture-reviewer:**
```
<task>
Adversarial architecture review of the changed files.
Find cohesion problems, coupling issues, layer violations, structural smells.
</task>
<context>
- Read the diff at .git/review-patch.diff (30-line context per hunk)
- Read the Discovery Map for role tags and integration points
- For each finding, cite file:line with verbatim line text
</context>
<constraints>
- Only report findings traceable to changed code
- Do not suggest speculative redesigns
- Order findings by structural impact
</constraints>
<verification>
- Every finding must have file:line evidence
- Drop findings you cannot ground in the actual diff
</verification>
<deliverable>
Findings grouped by severity (Critical/High/Medium/Low).
Each finding: title, file:line citation with verbatim line, impact, fix.
Summary table at the end.
</deliverable>
```

**tests-reviewer:** coverage gaps, scenario coverage from specs, test quality, missing edge cases

**performance-reviewer:** hot paths, allocations, N+1, resource leaks, scaling concerns

**security-reviewer:** sinks, auth boundaries, input validation, secrets in diff, trust boundaries

#### Deduplication rules (from multi-reviewer-patterns)

- Same file:line, same issue → merge, credit all reviewers
- Same file:line, different issues → keep both
- Same issue, different locations → keep separate, cross-reference
- Conflicting severity → use higher rating
- Conflicting recommendations → include both with reviewer attribution

#### Severity calibration

| Severity | Impact | Examples |
|---|---|---|
| Critical | Data loss, security breach, complete failure | SQL injection, auth bypass, data corruption |
| High | Significant functionality impact | Memory leak, missing validation, broken flow |
| Medium | Partial impact, workaround exists | N+1 query, missing edge case, unclear error |
| Low | Minimal impact, cosmetic | Style issue, minor optimization, naming |

**Floor rules:**
- Security vulnerabilities exploitable externally: always Critical or High
- Performance issues in hot paths: at least Medium
- Missing tests for critical paths: at least Medium
- Code style with no functional impact: Low

#### Consolidated report template

```markdown
## Code Review Report

**Target**: {files/PR/directory}
**Reviewers**: architecture, tests, performance, security
**Date**: {date}
**Files Reviewed**: {count}

### Critical Findings ({count})
#### [CR-001] {Title}
**Location**: `{file}:{line}`
**Dimension**: {architecture/tests/performance/security}
**Description**: {what was found}
**Impact**: {what could happen}
**Fix**: {recommended remediation}

### High Findings ({count})
...

### Medium Findings ({count})
...

### Low Findings ({count})
...

### Summary

| Dimension | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Architecture | | | | | |
| Tests | | | | | |
| Performance | | | | | |
| Security | | | | | |
| **Total** | | | | | |

### Recommendation
{Overall assessment and prioritized action items}
```

### commit — structured commits

Lightweight. Analyzes staged/unstaged changes, groups logically, writes descriptive commit messages. No agents.

### continue-change — openspec continue

Continue an existing change artifact-by-artifact. Uses `openspec status` + `openspec instructions` to create the next artifact. No agents.

## Extension

### Bootstrap injection (before_agent_start)

Inspired by pi-superpowers. Injects into the system prompt on every agent turn:

```
# OpenSpec Workflow + Codebase Memory

## Available Tools

### Codebase Memory (use INSTEAD of grep for code understanding)
- codebase_memory_search_graph — find functions, classes, routes by name or semantic query
- codebase_memory_trace_path — trace callers/callees, data flow, cross-service paths
- codebase_memory_get_code_snippet — read source for a known symbol
- codebase_memory_search_code — grep+graph augmented search
- codebase_memory_get_architecture — packages, services, dependencies at a glance
- codebase_memory_query_graph — Cypher for complex multi-hop patterns

### OpenSpec CLI
- openspec — spec-driven development workflow

## When to use codebase-memory vs grep
- "Where is X defined?" → search_graph
- "Who calls this function?" → trace_path(direction: inbound)
- "How does data flow from A to B?" → trace_path(mode: data_flow)
- "What's the architecture?" → get_architecture
- "Find patterns like X" → search_graph(semantic_query)
- "I need to read this specific file" → read (not codebase-memory)

## OpenSpec Workflow
explore → propose → apply → verify → review → commit
Use /openspec-explore, /openspec-propose, etc.
```

### Session hooks

- **session_start**: sync agents, inject git context, scaffold openspec dirs, warn missing siblings
- **session_compact**: re-inject git context and guidance
- **session_shutdown**: cleanup injection state
- **tool_call**: inject guidance on file touch, clear git cache on mutating git commands
- **before_agent_start**: inject bootstrap prompt + git context if changed

### Commands

| Command | Description |
|---|---|
| `/openspec-setup` | Install sibling packages |
| `/openspec-update-agents` | Sync agent profiles |

## Agents → Skills Matrix

| Agent | Used by | Dispatch pattern |
|---|---|---|
| `artifact-reviewer` | `propose` | ×4 parallel (one per artifact) |
| `architecture-reviewer` | `review` | ×1 parallel with others |
| `tests-reviewer` | `review` | ×1 parallel with others |
| `performance-reviewer` | `review` | ×1 parallel with others |
| `security-reviewer` | `review` | ×1 parallel with others |
| `claim-verifier` | `verify` | ×1 solo |

## Agent profile format

All agent profiles use the Prompt Leverage framework (from pi-augment):

```markdown
---
name: architecture-reviewer
description: Adversarial architecture reviewer for code review
---

<task>
[What to do]
</task>

<context>
[What to read, what's available]
</context>

<constraints>
[What not to do, boundaries]
</constraints>

<verification>
[How to validate findings]
</verification>

<deliverable>
[Output format and structure]
</deliverable>
```

No encyclopedic knowledge dumps. Focused, executable contracts.

## Custom Schema: review-enforced

Extends spec-driven with an artifact review gate before implementation:

```yaml
name: review-enforced
version: 1
description: spec-driven + adversarial artifact review gate before implementation
artifacts:
  - id: proposal
    generates: proposal.md
    description: Initial proposal document outlining the change
    template: proposal.md
    instruction: |
      Create the proposal document that establishes WHY this change is needed.
      Sections: Why, What Changes, Capabilities, Impact.
      Focus on "why" not "how". Implementation details belong in design.md.
    requires: []

  - id: specs
    generates: "specs/**/*.md"
    description: Detailed specifications for the change
    template: spec.md
    instruction: |
      Create specification files that define WHAT the system should do.
      One spec per capability from proposal. ADDED/MODIFIED/REMOVED sections.
      Use SHALL/MUST. WHEN/THEN scenarios with exactly 4 hashtags.
      Every requirement must have at least one scenario.
    requires: [proposal]

  - id: design
    generates: design.md
    description: Technical design document
    template: design.md
    instruction: |
      Create the design document that explains HOW to implement the change.
      Sections: Context, Goals/Non-Goals, Decisions (with rationale),
      Risks/Trade-offs, Migration Plan, Open Questions.
      Focus on architecture and approach, not line-by-line implementation.
    requires: [proposal]

  - id: tasks
    generates: tasks.md
    description: Implementation checklist
    template: tasks.md
    instruction: |
      Break implementation into checkboxed tasks.
      Group under ## numbered headings. Each task: `- [ ] X.Y description`.
      Small enough for one session. Ordered by dependency.
    requires: [specs, design]

  - id: artifact-review
    generates: artifact-review.md
    description: Adversarial review of all artifacts
    template: artifact-review.md
    instruction: |
      Review ALL artifacts for:
      1. Compartmentalization — proposal is WHY/WHAT, specs is testable requirements,
         design is HOW decisions, tasks is ordered steps. No cross-contamination.
      2. Industry shape — each document reads like what it claims to be,
         not a narrative trying to tell the whole story.
      3. Cross-consistency — no contradictions between artifacts.
         Design matches proposal scope, tasks map to specs, etc.
      4. Completeness — a developer can implement from these artifacts
         without asking clarifying questions.

      This review runs as 4 parallel agent dispatches (one per artifact),
      each cross-checking against the others.

      CRITICAL: If the review finds compartmentalization problems
      (implementation details in proposal, design decisions in specs, etc.),
      fix the artifacts before proceeding to apply.
    requires: [proposal, specs, design, tasks]

apply:
  requires: [artifact-review]
  tracks: tasks.md
  instruction: |
    Read context files, work through pending tasks, mark complete as you go.
    Pause if you hit blockers or need clarification.
```

## Language Rule Packs

Stored in `rules/`. Injected via `openspec/config.yaml` `rules:` field or via the bootstrap extension when a language is detected.

### rules/rust.md

```markdown
## Rust Rules

### proposal
- Note ownership/lifetime implications at a high level
- Flag trait design considerations

### specs
- Scenarios must cover panic vs Result paths explicitly
- Include concurrency safety requirements (Send/Sync assumptions)
- Cover error variant exhaustiveness expectations

### design
- Document error handling strategy: thiserror vs anyhow vs custom, when each applies
- Document trait design: object-safe vs not, blanket impls, sealed traits
- Document lifetime/ownership decisions for new types
- Note any unsafe blocks and their safety invariants
- Specify the testing approach: unit vs integration vs doc tests

### tasks
- Include `cargo clippy --all-targets --all-features` verification step
- Include `cargo test` after implementation
- Include `cargo check` after structural changes (before full test)
- Separate trait definition tasks from implementation tasks
- Include `cargo fmt --check` for formatting verification
```

### rules/typescript.md

```markdown
## TypeScript Rules

### proposal
- Note module boundary implications
- Flag async pattern considerations

### specs
- Scenarios must cover both success and error paths
- Include edge cases for null/undefined/optional values
- Cover async error scenarios (timeouts, cancellations)

### design
- Document module boundaries and barrel export strategy
- Document type design: branded types, discriminated unions, generics
- Document async patterns: Promises vs async/await, error handling
- Note any `any` escape hatches and why they're justified
- Specify the testing approach: unit vs integration vs e2e

### tasks
- Include `tsc --noEmit` typecheck verification step
- Include test runner step (vitest/jest) after implementation
- Include linting step after structural changes
- Separate type definition tasks from implementation tasks
- Consider adding types first, then implementation
```

### rules/python.md

```markdown
## Python Rules

### proposal
- Note typing implications (typed vs untyped boundaries)
- Flag dependency considerations

### specs
- Scenarios must cover both happy and exception paths
- Include edge cases for None, empty collections, type boundaries
- Cover async scenarios if applicable

### design
- Document type strategy: runtime vs static typing, Protocol vs ABC
- Document error handling: exceptions vs Result pattern, custom hierarchy
- Document dependency management approach
- Note any dynamic dispatch patterns and their constraints

### tasks
- Include type checking step (mypy/pyright) after implementation
- Include test step (pytest) after implementation
- Include linting step (ruff) after structural changes
- Separate interface definition from implementation tasks
```

### rules/go.md

```markdown
## Go Rules

### proposal
- Note interface design implications
- Flag goroutine/concurrency considerations

### specs
- Scenarios must cover both success and error paths
- Include edge cases for nil values, empty slices
- Cover concurrent access scenarios

### design
- Document interface design: small interfaces, implicit satisfaction
- Document error handling: sentinel errors, wrapped errors, custom types
- Document concurrency patterns: goroutines, channels, sync primitives
- Note any cgo usage and its implications

### tasks
- Include `go vet` step after implementation
- Include `go test` step after implementation
- Include `go build` after structural changes
- Separate interface definition from implementation tasks
```

## Peer Dependencies (Siblings)

| Package | Provides | Required |
|---|---|---|
| `@tintinweb/pi-subagents` | Agent / get_subagent_result / steer_subagent tools | Yes |
| `@juicesharp/rpiv-ask-user-question` | ask_user_question tool | Yes |
| `@juicesharp/rpiv-todo` | todo tool + /todos command + overlay | Yes |
| `@juicesharp/rpiv-advisor` | advisor tool + /advisor command | Yes |
| `@juicesharp/rpiv-web-tools` | web_search + web_fetch + /web-search-config | Yes |
| `@juicesharp/rpiv-args` | $ARGUMENTS substitution in skill bodies | Yes |
| `pi-augment` | /augment command (prompt enhancement) | No (optional) |

Dropped from rpiv-pi: `rpiv-i18n` (not needed).

## Skills → Agents → Tools Matrix

| Skill | Agents dispatched | Codebase-memory tools | Other tools |
|---|---|---|---|
| `explore` | none | search_graph, trace_path, get_code_snippet, search_code, get_architecture, query_graph | openspec CLI, read, grep |
| `propose` | artifact-reviewer ×4 | search_graph, get_architecture | openspec CLI, write, ask_user_question |
| `apply` | none | none | openspec CLI, read, write, edit, bash |
| `verify` | claim-verifier ×1 | search_code, get_code_snippet | openspec CLI, read, grep |
| `review` | architecture/tests/perf/sec ×4 | search_graph, trace_path | bash (git), read, grep |
| `commit` | none | none | bash (git) |
| `continue-change` | none | none | openspec CLI, read, write, ask_user_question |

## Comparison with rpiv-pi

| Aspect | rpiv-pi | pi-openspec-workflow |
|---|---|---|
| Agents | 12+ agents, multi-wave orchestration | 6 agents, single-wave parallel dispatch |
| Research | scope-tracer → 3-6 codebase-analyzers | codebase-memory queries (no agents) |
| Artifact system | thoughts/shared/ (custom) | openspec CLI (industry tool) |
| Code review | 4-wave cascade (integration → quality/security → predicate/interaction → claim-verify) | 1-wave parallel (4 specialist agents → dedup → calibrate) |
| Plan review | none | artifact-reviewer gate before apply |
| Agent profiles | 200-line knowledge dumps | Prompt Leverage execution contracts |
| Language rules | none | per-language rule packs (Rust, TS, Python, Go) |

## Implementation Order

### Phase 1: Foundation
1. `package.json` — pi-package manifest with peer deps
2. `extensions/openspec-core/` — bootstrap + session hooks + setup command
3. `agents/` — 6 agent profiles in Prompt Leverage format

### Phase 2: Core Skills
4. `skills/explore/SKILL.md` — codebase-memory research + thinking partner
5. `skills/propose/SKILL.md` — openspec propose + artifact review gate
6. `skills/apply/SKILL.md` — task execution
7. `skills/commit/SKILL.md` — structured commits

### Phase 3: Verification & Review
8. `skills/verify/SKILL.md` — claim-verifier verification
9. `skills/review/SKILL.md` — 4-lens parallel code review

### Phase 4: Profile & Rules
10. `openspec/schemas/review-enforced.yaml` — custom schema
11. `rules/` — language-specific rule packs
12. `templates/` — artifact templates

### Phase 5: Polish
13. `skills/continue-change/SKILL.md` — artifact-by-artifact continuation
14. `README.md` — usage docs
15. Tests for extension
