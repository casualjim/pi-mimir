## ADDED Requirements

### Requirement: Setup syncs workflow assets before reporting completeness
`/openspec:init` and `/openspec:update` SHALL continue to sync OpenSpec workflow assets before reporting whether the full workflow setup is complete.

#### Scenario: External plugin is missing during setup
- **WHEN** a user runs `/openspec:init` or `/openspec:update` without active codebase-memory support
- **THEN** the command still syncs the package-owned OpenSpec assets first
- **AND** the final result reports that workflow setup is incomplete

### Requirement: Setup shows the exact codebase-memory install command
When full workflow setup is incomplete because codebase-memory support is unavailable, `pi-mimir` SHALL show the exact install command `pi install @casualjim/pi-codebase-memory`.

#### Scenario: Codebase-memory support is absent
- **WHEN** setup determines that codebase-memory support is unavailable
- **THEN** the result includes `pi install @casualjim/pi-codebase-memory`
- **AND** the message explains that full workflow readiness depends on that plugin being installed and active

### Requirement: Tool availability determines workflow completeness
Workflow setup completeness SHALL be determined by the availability of the required `codebase_memory_*` tools, not only by package presence in settings.

#### Scenario: Plugin is installed but tools are unavailable
- **WHEN** `pi-codebase-memory` appears to be installed but the required `codebase_memory_*` tools are not available to the session
- **THEN** setup still reports workflow setup as incomplete
- **AND** it does not claim full architecture-aware discovery readiness

### Requirement: Degraded runtime discovery remains explicit
When codebase-memory support is unavailable at runtime, the workflow SHALL continue to allow exact file reads or shell inspection as degraded discovery and SHALL say that degraded mode is in effect.

#### Scenario: User continues without the plugin
- **WHEN** codebase-memory support is unavailable during a workflow session
- **THEN** the workflow may fall back to exact reads or shell inspection
- **AND** it explicitly reports degraded discovery instead of presenting the setup as complete
