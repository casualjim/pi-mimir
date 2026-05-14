## ADDED Requirements

### Requirement: Definition skill delegates to planner
The `define` skill SHALL delegate definition-phase behavior to the `planner` agent. Planning and plan-verification subagents inherit active context; exploration is not delegated to a subagent.

#### Scenario: User invokes definition
- **WHEN** a user invokes `define`
- **THEN** the skill routes exploration, artifact creation, and artifact review coordination through `planner`

### Requirement: Definition uses OpenSpec instructions
The planner SHALL use OpenSpec status and instructions to create or update artifacts.

#### Scenario: Artifact is ready
- **WHEN** `openspec status --change <name> --json` reports an artifact as `ready`
- **THEN** the planner retrieves `openspec instructions <artifact-id> --change <name> --json` before writing the artifact

### Requirement: Dependency artifacts are read
The planner SHALL read completed dependency artifacts before creating dependent artifacts.

#### Scenario: Design is ready
- **WHEN** the design artifact depends on proposal
- **THEN** the planner reads `proposal.md` before writing `design.md`

### Requirement: No implementation during definition
The planner SHALL NOT write application code.

#### Scenario: User requests implementation
- **WHEN** the user asks for application code changes during definition
- **THEN** the planner explains that implementation belongs in delivery after artifact review passes

### Requirement: Artifact review before delivery
The planner SHALL run proposal, specs, design, and tasks review skills before declaring the change ready for delivery via subagents whose prompts start with `/skill:<openspec-skill-name> <change-name>`.

#### Scenario: Definition artifacts are complete
- **WHEN** proposal, specs, design, and tasks are complete
- **THEN** the planner runs the configured artifact review skills and synthesizes their findings

### Requirement: Artifact fix loop
The planner SHALL resolve blocking artifact review findings before delivery.

#### Scenario: Reviewer reports a blocking issue
- **WHEN** an artifact reviewer reports a blocking or material issue
- **THEN** the planner updates the relevant artifact or asks the user for a decision before declaring delivery readiness
