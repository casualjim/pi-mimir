## ADDED Requirements

### Requirement: Create openspec change and generate artifacts
The propose skill SHALL create a new openspec change using `openspec new change "<name>"` and generate all artifacts in dependency order by iteratively calling `openspec status --json` and `openspec instructions <artifact-id> --json`.

#### Scenario: User provides a change name
- **WHEN** user invokes propose with a kebab-case name and description
- **THEN** skill creates the change, generates all artifacts sequentially (proposal → specs/design → tasks), and reports readiness for implementation

#### Scenario: User provides only a description
- **WHEN** user invokes propose with a description but no name
- **THEN** skill derives a kebab-case name from the description, confirms with the user, and proceeds

#### Scenario: User provides no input
- **WHEN** user invokes propose without a name or description
- **THEN** skill asks the user what they want to build using the AskUserQuestion tool

### Requirement: Artifact creation follows openspec instructions
For each artifact, the propose skill SHALL call `openspec instructions <artifact-id> --json` to get the template, rules, and context. It SHALL use the template as the output structure and apply rules as constraints without copying them into the artifact file.

#### Scenario: Creating an artifact with template
- **WHEN** generating any artifact (proposal, specs, design, tasks)
- **THEN** skill reads the template from `openspec instructions`, fills in the sections based on the user's request and codebase research, and writes to the specified output path

### Requirement: Dependency-ordered generation
The propose skill SHALL read completed dependency artifacts before creating new ones. It SHALL NOT create an artifact until all its dependencies (from the schema) have `status: "done"`.

#### Scenario: Creating design.md
- **WHEN** design artifact becomes `ready` after proposal is done
- **THEN** skill reads proposal.md for context before writing design.md

### Requirement: Artifact review gate
After all artifacts required for apply are generated, the propose skill SHALL dispatch the artifact-reviewer agent ×4 in parallel — one per artifact (proposal, specs, design, tasks). Each dispatch SHALL instruct the reviewer to audit one artifact while cross-checking the others. The skill SHALL synthesize findings, fix artifacts, and confirm readiness.

#### Scenario: All artifacts generated
- **WHEN** all `applyRequires` artifacts have `status: "done"`
- **THEN** skill dispatches 4 parallel artifact-reviewer agents with different review focuses (one per artifact), collects findings, fixes compartmentalization problems, and reports readiness

#### Scenario: Review finds compartmentalization problems
- **WHEN** an artifact-reviewer reports implementation details in proposal.md or design decisions in specs
- **THEN** skill fixes the artifacts by moving content to the correct document and re-dispatches review if needed

### Requirement: Existing change handling
If a change with the requested name already exists, the propose skill SHALL ask the user whether to continue it or create a new one.

#### Scenario: Duplicate change name
- **WHEN** `openspec new change "<name>"` fails because the name exists
- **THEN** skill asks the user to choose between continuing the existing change or picking a new name

### Requirement: Progress tracking
The propose skill SHALL use the TodoWrite tool to track progress through artifact generation.

#### Scenario: Generating multiple artifacts
- **WHEN** skill begins generating artifacts
- **THEN** it creates one todo per artifact and marks each in_progress/completed as it proceeds
