## ADDED Requirements

### Requirement: Separate codebase-memory plugin owns integration details
The workspace SHALL define `pi-codebase-memory` as the owner of codebase-memory integration details, including MCP server wiring, `codebase-memory-mcp` packaging, direct-tools exposure, and generic codebase-memory assets.

#### Scenario: Integration ownership is split
- **WHEN** the repository is updated for the plugin split
- **THEN** codebase-memory-specific installation and MCP wiring logic live in `pi-codebase-memory`
- **AND** `pi-mimir` no longer bundles or configures `codebase-memory-mcp` itself

### Requirement: pi-mimir depends on codebase-memory capabilities, not internals
`pi-mimir` SHALL treat codebase-memory as an external capability and SHALL only depend on the availability of the `codebase_memory_*` tools needed by the workflow.

#### Scenario: Workflow package checks for codebase-memory support
- **WHEN** `pi-mimir` evaluates whether full workflow support is available
- **THEN** it checks whether the required `codebase_memory_*` tools are available
- **AND** it does not inspect or mutate plugin-owned MCP internals as part of that decision

### Requirement: Generic codebase-memory assets move with the new plugin
Generic codebase-memory skills, guidance, and related tests SHALL be packaged with `pi-codebase-memory` instead of `pi-mimir`.

#### Scenario: Generic codebase-memory assets are published
- **WHEN** the split plugin is packaged
- **THEN** generic codebase-memory assets are published from `pi-codebase-memory`
- **AND** `pi-mimir` only retains OpenSpec-specific workflow guidance that references those capabilities
