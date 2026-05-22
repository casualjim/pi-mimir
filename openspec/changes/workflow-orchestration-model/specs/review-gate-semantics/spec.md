## ADDED Requirements

### Requirement: Artifact review gates
The plan flow SHALL review generated OpenSpec artifacts before declaring a change ready for implementation, and the package SHALL provide a separate `review-plan` workflow that orchestrates schema-owned per-gate outputs (`reviews/proposal.md`, `reviews/specs.md`, `reviews/design.md`, and `reviews/tasks.md`).

#### Scenario: Definition artifacts are complete
- **WHEN** proposal, specs, design, and tasks are complete according to OpenSpec status
- **THEN** the plan or `review-plan` orchestrator runs artifact review gates for the completed artifacts and records each gate in its own review artifact
- **AND** it synthesizes findings before proceeding

### Requirement: Implementation review gates
The implement flow SHALL run implementation review gates only after task execution and verification, and the package SHALL provide a separate `review-implementation` workflow that orchestrates schema-owned per-gate outputs (`reviews/architecture.md`, `reviews/tests.md`, `reviews/performance.md`, and `reviews/security.md`) when implementation evidence exists.

#### Scenario: Implementation verification passes
- **WHEN** tracked tasks are complete and implementation has been verified against OpenSpec artifacts
- **THEN** the implement or `review-implementation` orchestrator runs configured architecture, tests, performance, and security review gates and records each gate in its own review artifact

### Requirement: Severity semantics
Review findings SHALL use consistent severity semantics that determine orchestration behavior.

#### Scenario: Review finding is reported
- **WHEN** a review skill reports a finding
- **THEN** it tags the finding as `blocker`, `concern`, or `suggestion`
- **AND** `blocker` findings must be fixed before proceeding
- **AND** `concern` findings must be fixed or explicitly accepted by the user
- **AND** `suggestion` findings are optional improvements

### Requirement: Findings are grounded and actionable
Review findings SHALL include evidence and the smallest concrete fix.

#### Scenario: Finding is emitted
- **WHEN** a reviewer reports an issue
- **THEN** the finding includes location, evidence, problem, impact, severity, and recommended fix
- **AND** vague preference-only feedback is omitted

### Requirement: Review synthesis avoids duplicate loops
The orchestrator SHALL deduplicate and classify review outputs before asking the user or editing artifacts.

#### Scenario: Multiple reviewers finish
- **WHEN** all configured reviewers for a gate complete
- **THEN** the orchestrator groups duplicate findings
- **AND** it presents or fixes the highest-severity actionable set
- **AND** it avoids repeatedly asking the user to adjudicate the same issue
