## ADDED Requirements

### Requirement: Valid OpenSpec schema structure
The review-gated schema definition SHALL use OpenSpec's supported schema YAML structure for workflow artifacts.

#### Scenario: Schema fields are inspected
- **WHEN** `packages/core/openspec/schemas/review-gated/schema.yaml` is inspected
- **THEN** it contains `name`, `version`, optional `description`, an `artifacts` array, and optional `apply` configuration
- **AND** it does not use unsupported top-level `summary`, `archive`, or `rules` fields

### Requirement: Artifact entries use supported fields
Each review-gated artifact entry SHALL be an object in the `artifacts` array with supported OpenSpec artifact fields.

#### Scenario: Artifact entry is inspected
- **WHEN** an artifact entry in `review-gated/schema.yaml` is inspected
- **THEN** it includes `id`, `generates`, `description`, `template`, and `requires`
- **AND** it does not use unsupported `path` or `instructions` fields

### Requirement: Artifact dependency graph mirrors apply readiness
The review-gated schema SHALL encode the artifact dependency graph required to make a change apply-ready.

#### Scenario: Dependencies are resolved
- **WHEN** OpenSpec evaluates the review-gated schema
- **THEN** `proposal` is initially ready
- **AND** `specs` requires `proposal`
- **AND** `design` requires `proposal`
- **AND** `tasks` requires both `specs` and `design`

### Requirement: Inline instructions carry schema-specific guidance
The review-gated schema SHALL place schema-specific artifact guidance in each artifact's inline `instruction` field.

#### Scenario: Artifact instructions are requested
- **WHEN** `openspec instructions <artifact-id> --change <change> --json` is run for a review-gated artifact
- **THEN** the returned instruction includes the review-gated guidance for that artifact
- **AND** the guidance is not loaded through an unsupported `instructions: templates/*.md` field

### Requirement: Templates remain artifact skeletons
Review-gated templates SHALL provide markdown structure and examples without owning orchestration policy.

#### Scenario: Template file is inspected
- **WHEN** a template under `packages/core/openspec/schemas/review-gated/templates/` is inspected
- **THEN** it provides the artifact's markdown skeleton or examples
- **AND** it does not contain setup behavior, agent dispatch behavior, archive behavior, or review-skill implementation rules

### Requirement: Apply configuration uses supported fields
The review-gated schema SHALL express apply readiness using OpenSpec's supported `apply` configuration fields.

#### Scenario: Apply configuration is inspected
- **WHEN** the `apply` section in `review-gated/schema.yaml` is inspected
- **THEN** it includes `requires: [tasks]`
- **AND** it includes `tracks: tasks.md`
- **AND** it uses inline `instruction` for apply guidance
- **AND** it does not use unsupported `instructions` indirection

### Requirement: Archive and ADR guidance stays outside schema YAML
Archive and ADR guidance SHALL NOT be represented as unsupported top-level schema YAML fields.

#### Scenario: Archive guidance is needed
- **WHEN** the workflow needs archive or post-landing ADR guidance
- **THEN** that guidance is provided through a supported OpenSpec archive/sync hook, package setup/config asset, generated instruction asset, or documentation
- **AND** `review-gated/schema.yaml` does not include a top-level `archive` object
