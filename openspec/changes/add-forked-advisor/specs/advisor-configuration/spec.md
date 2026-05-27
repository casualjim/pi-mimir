## ADDED Requirements

### Requirement: Advisor is disabled until configured
The advisor package SHALL register advisor functionality in an inactive state until the user selects an advisor model.

#### Scenario: No advisor model selected
- **WHEN** a session starts without a configured advisor model
- **THEN** the advisor tool is not active for the executor model

### Requirement: Advisor selection is interactive and persistent
The advisor package SHALL provide an interactive configuration flow that lets the user choose an advisor model, choose advisor effort when supported, and persist that selection across sessions.

#### Scenario: User configures an advisor
- **WHEN** the user runs the advisor configuration command and selects a model and effort
- **THEN** later sessions restore the same advisor model and effort selection

### Requirement: Advisor can be disabled explicitly
The advisor package SHALL let the user disable advisor behavior without uninstalling the package.

#### Scenario: User chooses no advisor
- **WHEN** the user selects the disable option in the advisor configuration flow
- **THEN** the advisor tool becomes inactive for subsequent turns and sessions

### Requirement: Advisor availability can be blocked per executor model
The advisor package SHALL support configuration that suppresses the advisor tool for specific executor models, including optional minimum-effort thresholds.

#### Scenario: Executor model is blocklisted
- **WHEN** the active executor model matches a disabled advisor rule
- **THEN** the advisor tool is not active for that session state

#### Scenario: Executor effort is below the block threshold
- **WHEN** the active executor model matches a disabled advisor rule with a minimum effort above the current executor effort
- **THEN** the advisor tool remains eligible to stay active
