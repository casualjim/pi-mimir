## ADDED Requirements

### Requirement: Implementation uses OpenSpec apply state
The implement flow SHALL use OpenSpec apply instructions and tracked task files as the source of implementation state.

#### Scenario: Implementation starts
- **WHEN** the user starts implementation for an apply-ready change
- **THEN** the orchestrator reads OpenSpec apply instructions
- **AND** it reads required context artifacts before implementation
- **AND** it tracks progress in the OpenSpec-designated task file

### Requirement: Incremental task execution
Implementation SHALL complete tasks incrementally and update task checkboxes only after corresponding work is done.

#### Scenario: Task is completed
- **WHEN** implementation for a tracked task is finished and checked
- **THEN** the corresponding checkbox is marked complete
- **AND** incomplete or blocked tasks remain unchecked

### Requirement: Verification before review
Implementation SHALL verify implementation against OpenSpec artifacts before implementation review gates run.

#### Scenario: Tasks are complete
- **WHEN** all tracked tasks are complete
- **THEN** the orchestrator verifies completeness, correctness, and coherence against proposal, specs, design, and tasks before specialist review

### Requirement: Explicit archive handoff without commits
The package SHALL stop before generated OpenSpec archive behavior and SHALL NOT commit, push, create pull requests, or create archive artifacts.

#### Scenario: Implementation gates pass
- **WHEN** task execution, verification, and implementation review gates pass
- **THEN** the orchestrator reports that generated OpenSpec archive behavior may be invoked explicitly
- **AND** it does not run `git commit`, `git push`, PR creation, or `openspec archive` commands

### Requirement: Superpowers finishing behavior stays out of review-gated implementation
Superpowers-style finishing branch behavior SHALL NOT be imported into this package's review-gated implementation workflow.

#### Scenario: Superpowers lessons are applied
- **WHEN** the package borrows phase or guardrail ideas from pi-superpowers or superpowers-bridge
- **THEN** it does not adopt commit, push, PR, or finishing-branch behavior in the review-gated workflow
