## ADDED Requirements

### Requirement: Codebase-memory-first propose discovery
The plan orchestrator SHALL use codebase-memory tools before subagents for ordinary codebase discovery.

#### Scenario: Propose needs code context
- **WHEN** the propose flow needs architecture, definitions, callers, data flow, patterns, or source snippets
- **THEN** it uses codebase-memory architecture, graph/code search, trace, query, and snippet tools before considering subagents

### Requirement: Intent before codebase probing
The plan flow SHALL understand the user's intent before running codebase discovery.

#### Scenario: Request is ambiguous
- **WHEN** the user asks to propose a change but intent or outcome is unclear
- **THEN** the orchestrator asks a targeted clarification before codebase probing
- **AND** it shapes discovery by the clarified intent rather than raw keywords alone

### Requirement: Bounded discovery stop condition
The plan flow SHALL stop discovery once it has enough evidence to create OpenSpec artifacts.

#### Scenario: Discovery is sufficient
- **WHEN** the orchestrator can identify likely affected capabilities, impact areas, relevant existing specs, and major implementation constraints
- **THEN** it proceeds to artifact generation instead of continuing broad research

### Requirement: User checkpoints are decision-oriented
The plan flow SHALL ask the user only for decisions that cannot be resolved from intent, codebase evidence, or existing project conventions.

#### Scenario: Ambiguity is found
- **WHEN** multiple valid choices remain after codebase-memory discovery
- **THEN** the orchestrator asks a concise grounded question with concrete options
- **AND** it records the chosen decision in the appropriate OpenSpec artifact

### Requirement: Research is ephemeral by default
The plan flow SHALL NOT create a durable research artifact by default.

#### Scenario: Standard plan flow runs
- **WHEN** the change can be proposed with bounded codebase-memory discovery
- **THEN** research findings inform proposal, specs, design, and tasks directly
- **AND** no competing `research.md` artifact is created outside OpenSpec unless the active schema explicitly defines one

### Requirement: Degraded discovery is explicit
The orchestrator SHALL report degraded discovery when codebase-memory is unavailable or stale.

#### Scenario: codebase-memory fails
- **WHEN** a codebase-memory tool is unavailable or returns unusable results
- **THEN** the orchestrator reports degraded discovery
- **AND** it falls back to exact file reads or shell inspection
- **AND** it does not claim architecture-aware discovery was completed
