## ADDED Requirements

### Requirement: Prompt Leverage format
The artifact-reviewer agent SHALL use the Prompt Leverage framework with `<task>`, `<context>`, `<constraints>`, `<verification>`, and `<deliverable>` sections. No encyclopedic knowledge dumps — focused, executable contracts.

#### Scenario: Agent profile structure
- **WHEN** the artifact-reviewer.md is loaded by the Agent tool
- **THEN** it contains exactly the five Prompt Leverage sections and nothing else beyond frontmatter

### Requirement: Adversarial artifact review
The artifact-reviewer agent SHALL review one primary artifact while cross-checking against all others. It SHALL check four dimensions:
1. **Compartmentalization** — proposal is WHY/WHAT, specs is testable requirements, design is HOW decisions, tasks is ordered steps. No cross-contamination between document types.
2. **Industry shape** — each document reads like what it claims to be, not a narrative trying to tell the whole story.
3. **Cross-consistency** — no contradictions between artifacts. Design matches proposal scope, tasks map to specs, etc.
4. **Completeness** — a developer can implement from these artifacts without asking clarifying questions.

#### Scenario: Reviewing proposal.md
- **WHEN** dispatched to review proposal.md
- **THEN** agent checks that proposal contains only WHY/WHAT, flags any implementation details or design decisions, and cross-checks scope against specs/design/tasks for consistency

#### Scenario: Reviewing specs
- **WHEN** dispatched to review specs
- **THEN** agent checks that specs contain testable requirements (WHEN/THEN scenarios), flags any design decisions or task-level detail, and cross-checks coverage against proposal/design/tasks

#### Scenario: Reviewing design.md
- **WHEN** dispatched to review design.md
- **THEN** agent checks that design contains HOW decisions with tradeoffs, flags any task-level detail or requirements, and cross-checks against proposal/specs/tasks

#### Scenario: Reviewing tasks.md
- **WHEN** dispatched to review tasks.md
- **THEN** agent checks that tasks are ordered granular steps, flags any narrative or design decisions, and cross-checks that every task maps to a spec requirement

### Requirement: Pipe-delimited row output
The artifact-reviewer agent SHALL emit findings as pipe-delimited rows with severity tags. Output SHALL be structured, not prose.

#### Scenario: Findings detected
- **WHEN** agent discovers compartmentalization or consistency issues
- **THEN** it emits one row per finding with format: `artifact | dimension | severity | finding | recommendation`

#### Scenario: No findings
- **WHEN** artifacts are well-compartmentalized and consistent
- **THEN** agent emits a summary confirming review passed with no issues

### Requirement: Read-only operation
The artifact-reviewer agent SHALL be read-only. It SHALL NOT edit, write, delete, or modify files. It SHALL only inspect and report findings.

#### Scenario: Agent execution
- **WHEN** artifact-reviewer runs
- **THEN** it uses only read, grep, find, ls, bash tools — no write or edit operations

### Requirement: Tools restriction
The agent SHALL have tools restricted to: `read, grep, find, ls, bash`. The `bash` access SHALL be used only for file inspection, not mutation.

#### Scenario: Agent tools configuration
- **WHEN** agent is dispatched
- **THEN** its `tools` frontmatter field lists exactly `read, grep, find, ls, bash`

### Requirement: Isolated execution
The agent SHALL run in isolated mode (`isolated: true` in frontmatter) to prevent side effects.

#### Scenario: Agent isolation
- **WHEN** agent is dispatched by the propose skill
- **THEN** it runs in isolation with no project context inheritance beyond what is explicitly provided
