## ADDED Requirements

### Requirement: Schema parser validation
The corrected review-gated schema SHALL validate against OpenSpec's schema parser before it is considered complete.

#### Scenario: Schema is validated
- **WHEN** OpenSpec validates or loads the `review-gated` schema
- **THEN** validation succeeds without schema shape errors
- **AND** dependency validation reports no missing artifact references or dependency cycles

### Requirement: Instruction generation validation
The corrected review-gated schema SHALL produce useful OpenSpec instructions for every artifact needed before apply.

#### Scenario: Artifact instructions are generated
- **WHEN** `openspec instructions proposal`, `openspec instructions specs`, `openspec instructions design`, and `openspec instructions tasks` are run for a change using `review-gated`
- **THEN** each command returns the expected `template`, `instruction`, `outputPath`, and dependency metadata

### Requirement: Apply instruction generation validation
The corrected review-gated schema SHALL produce useful OpenSpec apply instructions once `tasks` is complete.

#### Scenario: Apply instructions are generated
- **WHEN** `openspec instructions apply --change <change> --json` is run for an apply-ready change using `review-gated`
- **THEN** the response includes apply requirements, the task tracking file, and inline apply guidance

### Requirement: Scope validation
The schema correction SHALL be limited to the review-gated schema asset and directly related template ownership decisions.

#### Scenario: Change scope is reviewed
- **WHEN** the implementation diff for this change is reviewed
- **THEN** it touches `packages/core/openspec/schemas/review-gated/schema.yaml` and any necessary files under `packages/core/openspec/schemas/review-gated/templates/`
- **AND** it does not modify planner agents, worker agents, review skills, setup commands, manifests, package registration, or unrelated documentation

### Requirement: No unsupported schema-policy fields
Validation SHALL catch any attempt to reintroduce unsupported policy fields into schema YAML.

#### Scenario: Unsupported field is reintroduced
- **WHEN** `summary`, `path`, `instructions`, top-level `archive`, or top-level `rules` is added to `review-gated/schema.yaml`
- **THEN** schema validation or review rejects the change before implementation is considered complete

### Requirement: Existing workflow boundaries remain intact
The schema correction SHALL preserve the broader workflow boundaries from the reframe plan without implementing the rest of that plan.

#### Scenario: Boundary is checked
- **WHEN** the schema-only change is reviewed
- **THEN** it keeps agent orchestration in planner/worker assets
- **AND** it keeps review gate implementation in review skills
- **AND** it keeps setup and managed asset behavior outside the schema file
- **AND** it preserves the no-commit workflow constraint in schema/apply guidance where relevant
