## ADDED Requirements

### Requirement: Narrow skill triggers
User-facing skills SHALL use narrow trigger descriptions that avoid broad ambient activation.

#### Scenario: Skill descriptions are inspected
- **WHEN** package skill descriptions are reviewed
- **THEN** they do not contain broad mandates such as "use before any creative work" or "use whenever building anything"
- **AND** each trigger names the specific OpenSpec workflow phase it starts, including narrow package-owned `plan` and `implement` phases

### Requirement: Explicit review workflows
Review skills SHALL be invoked by plan, implement, `review-plan`, or `review-implementation` orchestrators at explicit gates rather than triggered by generic user language.

#### Scenario: Review gate is reached
- **WHEN** artifacts or implementation reach a configured review gate, or the user explicitly invokes `review-plan` or `review-implementation`
- **THEN** the orchestrator invokes the relevant review skills
- **AND** review workflows and review skills do not advertise themselves as generic replacements for all code review, design review, or planning review requests

### Requirement: Generated OpenSpec skill coexistence
The package SHALL define how its orchestrator entrypoints coexist with generated OpenSpec `/opsx:*` or `openspec-*` skills.

#### Scenario: Generated OpenSpec skills are present
- **WHEN** generated OpenSpec skills exist in the environment
- **THEN** package guidance identifies the preferred package entrypoints for this workflow
- **AND** it does not hide or break generated OpenSpec skills
- **AND** it avoids contradictory instructions about which workflow owns proposing and delivery

### Requirement: Overlap warnings
The extension SHALL warn when installed skills from rpiv-pi, pi-superpowers, or other generic workflow packages may over-trigger or steer the agent into a conflicting workflow.

#### Scenario: Overlap is detected
- **WHEN** the extension detects overlapping generic workflow skills or package markers
- **THEN** it reports a concise warning that names the conflict and the preferred OpenSpec-native entrypoint

### Requirement: Trigger hygiene is testable
Trigger hygiene SHALL be validated through package registration and skill-frontmatter tests.

#### Scenario: Registration tests run
- **WHEN** package tests inspect registered skills and descriptions
- **THEN** they verify the public workflow surface is narrow
- **AND** they verify broad generic workflow skill names are not registered
- **AND** they verify review skills are not described as ambient catch-all triggers
