## ADDED Requirements

### Requirement: Names are product-facing, not literal internals
The package SHALL use concise product-facing names for user-visible skills, prompts, commands, and agents.

#### Scenario: User-facing names are reviewed
- **WHEN** skills, prompts, commands, and agent names are inspected
- **THEN** names avoid overly literal implementation phrases and read as intentional product surface

### Requirement: Internal names remain maintainable
Internal implementation files SHALL use maintainable names, and MAY be explicit when clarity helps maintenance.

#### Scenario: Internal module is named
- **WHEN** a file or helper is not user-visible
- **THEN** it may use a descriptive implementation name if the public surface remains polished

### Requirement: Setup provides copy-paste codebase-memory prompt
The setup command SHALL provide a copy-paste prompt when codebase-memory MCP is unavailable.

#### Scenario: codebase-memory MCP is missing
- **WHEN** `/openspec-setup` cannot detect codebase-memory MCP tools
- **THEN** it displays a concise prompt the user can copy into Pi or another agent to install and configure codebase-memory MCP

### Requirement: Setup does not silently attempt complex MCP installation
The setup command SHALL NOT silently perform multi-step codebase-memory MCP installation unless the package later owns a bundled installer.

#### Scenario: codebase-memory is externally installed
- **WHEN** codebase-memory is not bundled by this package
- **THEN** setup explains the missing dependency and presents the copy-paste install prompt rather than hiding the setup behind opaque automation
