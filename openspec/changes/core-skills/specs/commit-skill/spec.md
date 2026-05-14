## ADDED Requirements

### Requirement: Change analysis
The commit skill SHALL analyze both staged and unstaged git changes to understand what has been modified. It SHALL use `git diff` and `git diff --staged` to inspect changes.

#### Scenario: Staged changes exist
- **WHEN** user has staged changes
- **THEN** skill analyzes the staged diff and generates a commit message

#### Scenario: Only unstaged changes exist
- **WHEN** user has unstaged but no staged changes
- **THEN** skill shows the changes and suggests staging them, then generates a commit message

#### Scenario: No changes exist
- **WHEN** working tree is clean
- **THEN** skill reports that there is nothing to commit

### Requirement: Logical grouping
The commit skill SHALL group related changes into logical commits when multiple unrelated changes are present. Each commit SHALL have a clear, descriptive message.

#### Scenario: Multiple unrelated changes
- **WHEN** staged changes span unrelated concerns (e.g., auth refactor + README typo)
- **THEN** skill suggests splitting into separate commits with one message per concern

#### Scenario: Single coherent change
- **WHEN** all changes relate to one concern
- **THEN** skill writes a single commit message

### Requirement: Descriptive commit messages
Commit messages SHALL follow conventional commit format with a concise subject line (≤50 characters) and an optional body when the "why" is not obvious from the subject alone.

#### Scenario: Self-explanatory change
- **WHEN** the change is straightforward (e.g., fixing a typo)
- **THEN** skill writes only a subject line

#### Scenario: Non-obvious change
- **WHEN** the reason for the change requires explanation
- **THEN** skill adds a body explaining the motivation

### Requirement: No agent dispatches
The commit skill SHALL NOT dispatch any agents. It operates purely with git and read tools.

#### Scenario: Running commit
- **WHEN** commit skill executes
- **THEN** it uses only bash (git), read, and edit tools — no Agent tool calls
