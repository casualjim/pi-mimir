## ADDED Requirements

### Requirement: OpenSpec-native workflow backbone
The package SHALL treat OpenSpec as the canonical workflow state machine and artifact store.

#### Scenario: Workflow state is needed
- **WHEN** an orchestrator needs to know what work is ready or complete
- **THEN** it uses OpenSpec change status, artifact dependencies, instructions, and validation as the source of truth
- **AND** it does not create a competing `thoughts/shared` pipeline for change-scoped proposal, research, design, plan, or validation state

### Requirement: Source-system lessons are explicit
The workflow model SHALL explicitly document which lessons are kept and rejected from rpiv-pi, pi-superpowers, and superpowers-bridge.

#### Scenario: Workflow model is reviewed
- **WHEN** the workflow design is inspected
- **THEN** it identifies rpiv-pi lessons kept and rejected
- **AND** it identifies pi-superpowers lessons kept and rejected
- **AND** it identifies superpowers-bridge lessons kept and rejected

### Requirement: Small public surface
The package SHALL expose a small number of OpenSpec-specific user-facing workflow entrypoints, including separate explicit review workflows.

#### Scenario: Public skills are listed
- **WHEN** the package's user-facing workflow skills are inspected
- **THEN** they are OpenSpec-specific entrypoints named `plan` and `implement` for proposing/planning and applying/implementing changes
- **AND** they include explicit review workflows named `review-plan` and `review-implementation` for orchestrating the schema-owned per-gate review artifacts independently
- **AND** `plan`, `implement`, `review-plan`, and `review-implementation` are documented as narrow OpenSpec-specific package entrypoints, not generic rpiv-style workflow steps
- **AND** other generic rpiv-style names such as `research`, `design`, `validate`, and `review` are not registered as primary workflow entrypoints

### Requirement: Orchestrators own phase steering
Dedicated orchestrator agents SHALL coordinate phase flow while keeping OpenSpec artifacts canonical.

#### Scenario: Plan phase runs
- **WHEN** a user starts the plan flow
- **THEN** the plan orchestrator uses OpenSpec status and instructions to create artifacts
- **AND** it uses codebase-memory for ordinary discovery
- **AND** it invokes review gates only after artifacts are ready

#### Scenario: Implement phase runs
- **WHEN** a user starts the implement/apply flow
- **THEN** the implement orchestrator uses OpenSpec apply instructions and tracked tasks
- **AND** it verifies implementation against OpenSpec artifacts
- **AND** it invokes implementation review gates only after verification

### Requirement: Real Pi workflow integration tests
The package SHALL include integration tests that exercise package workflow entrypoints inside a real Pi runtime context.

#### Scenario: Integration tests run
- **WHEN** workflow integration tests are executed
- **THEN** they install the package into an isolated Pi agent home
- **AND** they run real Pi non-interactive sessions
- **AND** they verify the OpenSpec workflow guidance and explicit review workflow skill invocations are available

### Requirement: OpenSpec CLI workflow behavior tests
The package SHALL include deterministic OpenSpec CLI tests for the review-gated schema graph and generated Pi skill integration.

#### Scenario: Schema graph behavior is tested
- **WHEN** workflow behavior tests run
- **THEN** they install the review-gated schema into a temporary OpenSpec project
- **AND** they run `openspec status`, `openspec instructions`, and generated Pi skill updates against that project
- **AND** they verify review milestones are real schema artifacts with generated outputs, dependencies, instructions, and templates
- **AND** they verify apply is blocked until required planning review gate artifacts exist

### Requirement: No source-system cloning
The package SHALL NOT clone rpiv-pi or pi-superpowers wholesale.

#### Scenario: Workflow architecture is implemented
- **WHEN** the implementation is reviewed
- **THEN** it does not recreate the full rpiv-pi discover → research → design → plan → implement → validate pipeline as separate public stages
- **AND** it does not import Superpowers' broad trigger rules or default artifact paths
