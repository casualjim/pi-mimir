## ADDED Requirements

### Requirement: /openspec-setup command
The extension SHALL register a `/openspec-setup` command that detects missing sibling packages, presents a confirmation dialog, installs them serially via `pi install`, and reports results.

#### Scenario: All siblings already installed
- **WHEN** the user runs `/openspec-setup` and all 5 siblings are present
- **THEN** a notification says all dependencies are already installed

#### Scenario: Missing siblings installed successfully
- **WHEN** the user runs `/openspec-setup` and 3 siblings are missing
- **THEN** a confirmation dialog lists the 3 packages, the user confirms, they are installed serially, and a success notification with restart prompt is shown

#### Scenario: Installation partially fails
- **WHEN** one of three packages fails to install
- **THEN** the report shows succeeded and failed packages separately

#### Scenario: Non-interactive mode
- **WHEN** `/openspec-setup` runs without UI (print/RPC mode)
- **THEN** an error notification is shown that the command requires interactive mode

### Requirement: /openspec:update command
The extension SHALL register a `/openspec:update` command that runs `openspec update --tools pi`, keeps the review-gated config in place, syncs bundled schemas/skills/agents, refreshes the managed manifest, and reports update counts.

#### Scenario: No changes needed
- **WHEN** OpenSpec tools and all bundled assets already match current versions
- **THEN** a notification says the workflow is updated and reports up-to-date assets

#### Scenario: Assets updated
- **WHEN** OpenSpec tools are updated, 2 agents are outdated, and 1 skill was added
- **THEN** the notification reports the OpenSpec update and asset sync counts
