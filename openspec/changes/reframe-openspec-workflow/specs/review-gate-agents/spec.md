## ADDED Requirements

### Requirement: Generic reviewer persona agent
The package SHALL provide a generic reviewer persona agent that can execute different review skills with a consistent adversarial review stance.

#### Scenario: Reviewer persona is invoked
- **WHEN** a review skill dispatches the reviewer persona agent
- **THEN** the agent applies the review instructions supplied by the skill rather than relying on a hardcoded specialized domain

### Requirement: Artifact review skills
The package SHALL provide review skills or prompts for proposal, specs, design, and tasks review.

#### Scenario: Proposal review runs
- **WHEN** the proposal review skill runs
- **THEN** it instructs the reviewer persona to check scope, why/what clarity, impact, stakeholder readability, and implementation-detail leakage

#### Scenario: Specs review runs
- **WHEN** the specs review skill runs
- **THEN** it instructs the reviewer persona to check requirement testability, scenario coverage, capability coverage, and design/task leakage

#### Scenario: Design review runs
- **WHEN** the design review skill runs
- **THEN** it instructs the reviewer persona to check technical decisions, rationale, tradeoffs, risks, consistency with proposal/specs, and task-level over-detail

#### Scenario: Tasks review runs
- **WHEN** the tasks review skill runs
- **THEN** it instructs the reviewer persona to check task order, granularity, dependency mapping, and implementability

### Requirement: Implementation review skills
The package SHALL provide review skills or prompts for architecture, tests, data-flow, and security review.

#### Scenario: Specialist implementation review runs
- **WHEN** architecture, tests, data-flow, or security review skills run
- **THEN** each skill supplies the reviewer persona with that review dimension's rules, evidence requirements, and output format

### Requirement: Grounded actionable findings
Review skills SHALL require grounded actionable findings.

#### Scenario: Reviewer reports an issue
- **WHEN** a review skill reports a finding
- **THEN** the finding includes severity, location, problem, impact, and recommended fix

### Requirement: Review synthesis
Orchestrators SHALL synthesize review results before proceeding.

#### Scenario: Review outputs are collected
- **WHEN** all configured review skills for a gate finish
- **THEN** the orchestrator deduplicates findings and decides whether to fix, ask the user, or proceed
