## ADDED Requirements

### Requirement: Git context resolution
The extension SHALL resolve the current git branch name, short commit hash, and git user name using two parallel `git rev-parse` calls and one `git config user.name` call.

#### Scenario: Inside a git repository
- **WHEN** the project directory is inside a git repository
- **THEN** the extension resolves branch (remapping detached HEAD to "detached"), short commit, and user name (falling back to `$USER` env var)

#### Scenario: Not a git repository
- **WHEN** the project directory is not inside a git repository
- **THEN** the extension returns null and no git context is injected

### Requirement: Cached injection with signature-based dedup
The extension SHALL cache the resolved git context and only re-inject when the branch+commit+user signature changes.

#### Scenario: Git context unchanged between turns
- **WHEN** the agent starts a new turn and the cached signature matches the previously injected signature
- **THEN** no message is injected

#### Scenario: Git context changed after a mutating command
- **WHEN** a mutating git command was run (clearing the cache) and the resolved signature differs from the previously injected one
- **THEN** a hidden message with the updated git context is injected

### Requirement: Detached HEAD remapping
The extension SHALL remap a raw `HEAD` response from `git rev-parse --abbrev-ref HEAD` to the string `"detached"`.

#### Scenario: Repository in detached HEAD state
- **WHEN** `git rev-parse --abbrev-ref HEAD` returns `HEAD`
- **THEN** the branch is reported as `detached`
