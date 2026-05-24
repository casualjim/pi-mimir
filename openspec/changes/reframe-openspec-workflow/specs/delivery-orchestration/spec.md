## ADDED Requirements

### Requirement: Delivery skill delegates to worker
The `deliver` skill SHALL delegate delivery-phase behavior to the `worker` agent.

#### Scenario: User invokes delivery
- **WHEN** a user invokes `deliver` for a change
- **THEN** the skill routes apply, verify, implementation review, and fix-loop coordination through `worker`

### Requirement: Delivery invokes isolated apply agent
The worker SHALL invoke an isolated `apply` agent that does not inherit context and uses the `openspec-apply-change` skill.

#### Scenario: Apply is ready
- **WHEN** delivery reaches implementation for a change
- **THEN** the worker invokes the apply agent with a prompt that starts `/skill:openspec-apply-change <change-name>`

### Requirement: Apply uses OpenSpec apply instructions
The apply agent SHALL use OpenSpec apply instructions to determine context files, task tracking, and implementation guidance.

#### Scenario: Apply instructions are available
- **WHEN** `openspec instructions apply --change <name> --json` returns context files and a tracking file
- **THEN** the apply agent reads all context files before implementation and updates only the returned tracking file for task progress

### Requirement: Incremental task execution
The apply agent SHALL implement tracked tasks incrementally and mark each task complete only after its implementation is done.

#### Scenario: Task is implemented
- **WHEN** the code change for a tracked task is complete
- **THEN** the apply agent changes that task checkbox from `- [ ]` to `- [x]`

### Requirement: Verification before implementation review
The worker SHALL verify implementation against OpenSpec artifacts before specialist implementation review.

#### Scenario: Tasks are complete
- **WHEN** all tracked tasks are complete
- **THEN** the worker verifies completeness, correctness, and coherence against proposal, specs, design, and tasks

### Requirement: Review skills after verification
The worker SHALL run architecture, tests, data-flow, and security review skills after verification passes via subagents whose prompts start with `/skill:<openspec-skill-name> <change-name>`.

#### Scenario: Verification passes
- **WHEN** verification has no unresolved blocking issue
- **THEN** the worker runs the configured implementation review skills and synthesizes their findings

### Requirement: Delivery stops at archive readiness
The worker SHALL stop after verification and review gates pass and SHALL NOT run git commit.

#### Scenario: Delivery gates pass
- **WHEN** verification and specialist review complete without unresolved blocking findings
- **THEN** the orchestrator reports that the change is ready to archive
