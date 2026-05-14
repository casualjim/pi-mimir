## ADDED Requirements

### Requirement: OpenSpec-specific workflow surface
The package SHALL register OpenSpec-specific workflow skills or prompts for definition and delivery.

#### Scenario: Package skills are installed
- **WHEN** the package skill registration is inspected
- **THEN** it includes `define` and `deliver`

### Requirement: Standalone operation
The package SHALL operate without `@juicesharp/rpiv-pi` installed.

#### Scenario: rpiv-pi is absent
- **WHEN** the package loads in a Pi environment without rpiv-pi
- **THEN** its registered skills, prompts, agents, and extension hooks load without missing rpiv-pi dependencies

### Requirement: Overlap warning
The extension SHALL warn when it detects rpiv-pi or generic overlapping planning skills.

#### Scenario: Overlap is detected
- **WHEN** rpiv-pi package markers or generic overlapping workflow skills are present
- **THEN** the extension reports that those skills may interfere with OpenSpec workflow steering

### Requirement: No commit workflow
The package SHALL NOT register or invoke a commit skill, prompt, command, or workflow phase.

#### Scenario: Workflow guidance is injected
- **WHEN** the agent receives package workflow guidance
- **THEN** the guidance does not include commit as a workflow step

### Requirement: No generic planning skill names
The package SHALL NOT register generic `research`, `design`, `plan`, `blueprint`, `implement`, `validate`, `review`, or `commit` skills.

#### Scenario: Skill registration is inspected
- **WHEN** package skills are listed
- **THEN** only OpenSpec-specific workflow skill names are present
