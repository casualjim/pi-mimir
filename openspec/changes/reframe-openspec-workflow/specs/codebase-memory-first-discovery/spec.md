## ADDED Requirements

### Requirement: Codebase-memory-first discovery
Orchestrators and the explore agent SHALL use codebase-memory tools before subagents for codebase discovery. The explore agent SHALL also be allowed to use `web_search` and `web_fetch`.

#### Scenario: Definition needs codebase context
- **WHEN** the planner needs definitions, callers, data flow, architecture, or implementation patterns
- **THEN** it uses the relevant codebase-memory tool directly

### Requirement: Discovery ladder is injected
The extension SHALL inject a codebase-memory discovery ladder into workflow guidance.

#### Scenario: Bootstrap guidance is added
- **WHEN** the package injects OpenSpec workflow guidance
- **THEN** it lists architecture overview, graph/code search, trace path, code snippet, exact reads, and direct synthesis before any subagent use

### Requirement: No discovery fan-out
Orchestrators SHALL NOT dispatch locator, analyzer, pattern, or research subagents for ordinary codebase discovery.

#### Scenario: Search can be answered by codebase-memory
- **WHEN** codebase-memory search, trace, architecture, snippet, or query tools can answer the question
- **THEN** the orchestrator does not dispatch a research subagent

### Requirement: Review subagents are allowed
Orchestrators SHALL dispatch subagents only for planning/plan verification, artifact review, claim verification, and specialist implementation review. Planning and plan-verification subagents inherit active context.

#### Scenario: Review gate is reached
- **WHEN** a configured review gate is reached
- **THEN** the planner or worker runs the configured review skill for that gate

### Requirement: Degraded discovery is reported
The orchestrator SHALL report degraded discovery when codebase-memory is unavailable or stale.

#### Scenario: Codebase-memory fails
- **WHEN** a codebase-memory tool is unavailable or returns unusable results
- **THEN** the orchestrator falls back to exact file reads or shell inspection and reports the degraded mode
