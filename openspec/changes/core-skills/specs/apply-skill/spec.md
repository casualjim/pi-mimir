## ADDED Requirements

### Requirement: Task execution from openspec context
The apply skill SHALL read the tasks.md from the active openspec change and execute pending tasks sequentially, marking `- [ ]` → `- [x]` as each completes.

#### Scenario: Starting implementation
- **WHEN** user invokes apply with a change name
- **THEN** skill runs `openspec instructions apply --json`, reads all context files, displays progress, and begins working through pending tasks

#### Scenario: All tasks already complete
- **WHEN** apply instructions report `state: "all_done"`
- **THEN** skill congratulates the user and suggests archiving the change

#### Scenario: Missing artifacts
- **WHEN** apply instructions report `state: "blocked"`
- **THEN** skill shows the blocking message and suggests using continue-change to complete missing artifacts

### Requirement: Change selection
The apply skill SHALL infer the change name from conversation context, auto-select if only one active change exists, or prompt the user to choose from `openspec list --json` when ambiguous.

#### Scenario: Single active change
- **WHEN** only one change exists and no name is provided
- **THEN** skill auto-selects that change and announces it

#### Scenario: Multiple active changes
- **WHEN** multiple changes exist and no name is provided
- **THEN** skill presents the list via AskUserQuestion and lets the user select

### Requirement: Pause on blockers
The apply skill SHALL pause when a task is unclear, reveals a design issue, or encounters an error. It SHALL report the issue and wait for user guidance rather than guessing.

#### Scenario: Unclear task
- **WHEN** a task description is ambiguous
- **THEN** skill pauses and asks for clarification

#### Scenario: Design issue discovered
- **WHEN** implementation reveals a problem with the design
- **THEN** skill pauses and suggests updating the design artifact

### Requirement: Context file reading
Before implementing any task, the apply skill SHALL read all context files specified in `openspec instructions apply --json` output (proposal, specs, design, tasks).

#### Scenario: Schema provides context files
- **WHEN** apply instructions return `contextFiles` mapping
- **THEN** skill reads every listed file before beginning task execution

### Requirement: Minimal scoped changes
Each code change SHALL be minimal and focused on the current task. The skill SHALL NOT implement future tasks or add scope beyond what the task description requires.

#### Scenario: Implementing a single task
- **WHEN** working on task 3 of 7
- **THEN** skill makes only the changes needed for task 3 and moves to task 4
