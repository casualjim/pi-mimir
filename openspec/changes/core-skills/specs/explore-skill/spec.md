## ADDED Requirements

### Requirement: Thinking-partner stance
The explore skill SHALL adopt a curious, non-prescriptive stance. It SHALL ask open-ended questions that surface multiple directions rather than funnelling the user through a single interrogation path. It SHALL NOT follow a fixed script or mandatory output sequence.

#### Scenario: User brings a vague idea
- **WHEN** user invokes explore with an imprecise description
- **THEN** skill responds with clarifying questions and visual diagrams (ASCII) that help the user think, without mandating a specific output artifact

#### Scenario: User brings a specific problem
- **WHEN** user invokes explore with a concrete issue
- **THEN** skill investigates the codebase using codebase-memory tools, draws architecture diagrams, and surfaces the relevant complexity

### Requirement: Codebase-memory tool integration
The explore skill SHALL use codebase-memory tools directly for all codebase understanding, without dispatching any agents. It SHALL reference the following tool mapping:

| Need | Tool |
|---|---|
| Find definitions | `codebase_memory_search_graph` |
| Trace callers/callees | `codebase_memory_trace_path` |
| Read a symbol's source | `codebase_memory_get_code_snippet` |
| Grep with graph context | `codebase_memory_search_code` |
| Architecture overview | `codebase_memory_get_architecture` |
| Complex multi-hop queries | `codebase_memory_query_graph` |

#### Scenario: User asks "where is X defined?"
- **WHEN** user needs to locate a definition
- **THEN** skill uses `codebase_memory_search_graph` to find it

#### Scenario: User asks "who calls this function?"
- **WHEN** user needs to understand callers
- **THEN** skill uses `codebase_memory_trace_path` with `direction: inbound`

#### Scenario: User asks for architecture overview
- **WHEN** user wants high-level structure
- **THEN** skill uses `codebase_memory_get_architecture`

### Requirement: OpenSpec context awareness
The explore skill SHALL check for active OpenSpec changes at the start by running `openspec list --json`. When a change exists, the skill SHALL read its artifacts and reference them naturally in conversation.

#### Scenario: No active changes exist
- **WHEN** `openspec list --json` returns no changes
- **THEN** skill thinks freely and may offer to create a proposal when insights crystallize

#### Scenario: Active change detected
- **WHEN** user mentions a change or one is detected
- **THEN** skill reads proposal/design/tasks and references them in conversation, offering to capture decisions in the appropriate artifact

### Requirement: No implementation
The explore skill SHALL NOT write code or implement features. It MAY create or update OpenSpec artifacts (proposals, specs, design) if the user explicitly asks — that is capturing thinking, not implementing.

#### Scenario: User asks to implement something
- **WHEN** user requests code changes during explore mode
- **THEN** skill reminds them to exit explore mode and create a change proposal instead

### Requirement: ASCII visualization
The explore skill SHALL use ASCII diagrams liberally when they help clarify thinking — system diagrams, state machines, data flows, architecture sketches, dependency graphs, and comparison tables.

#### Scenario: Complex system being discussed
- **WHEN** user describes or the skill discovers a multi-component system
- **THEN** skill renders an ASCII diagram showing the components and their relationships
