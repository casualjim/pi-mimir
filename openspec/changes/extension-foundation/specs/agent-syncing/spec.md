## ADDED Requirements

### Requirement: Bundled agent syncing on session start
The extension SHALL copy bundled agent profiles from `<package_root>/agents/` into `<cwd>/.pi/agents/` at session start using read-only mode: adds new files, detects drift on existing files, but does not overwrite user-modified files.

#### Scenario: Fresh install with no existing agents
- **WHEN** session starts and `.pi/agents/` contains no managed profiles
- **THEN** all bundled agent profiles are copied and tracked in the manifest

#### Scenario: Bundled agent updated since last sync
- **WHEN** session starts and a managed agent file's destination content differs from the source
- **THEN** the file is reported as pending update but not overwritten

### Requirement: Manifest-based ownership tracking
The extension SHALL use a `.openspec-managed.json` manifest in `.pi/agents/` to track which files are owned by the extension, storing filename-to-sha256 mappings.

#### Scenario: Manifest does not exist
- **WHEN** session starts and no manifest exists
- **THEN** a new manifest is created with sha256 hashes of all copied files

#### Scenario: Stale managed file (removed from bundle)
- **WHEN** the manifest lists a file that no longer exists in the bundled agents directory
- **THEN** the file is reported as pending remove but not deleted in read-only mode

### Requirement: Apply-mode sync via command
The extension SHALL provide an apply-mode sync that adds new files, overwrites changed managed files, and removes stale managed files.

#### Scenario: User runs /openspec:update
- **WHEN** the user invokes `/openspec:update`
- **THEN** `openspec update --tools pi` runs, bundled schemas/skills/agents are synced, and stale managed agents are removed
