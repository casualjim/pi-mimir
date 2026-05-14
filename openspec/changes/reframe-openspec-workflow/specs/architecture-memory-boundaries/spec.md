## ADDED Requirements

### Requirement: OpenSpec owns change-scoped artifacts
OpenSpec artifacts SHALL be canonical for change-scoped proposal, requirements, design, and task information.

#### Scenario: Change-scoped decision is recorded
- **WHEN** a decision applies to a specific OpenSpec change
- **THEN** it is recorded in the relevant OpenSpec artifact

### Requirement: Codebase-memory ADR owns durable architecture memory
codebase-memory ADR SHALL store durable project-level architecture summaries and conventions.

#### Scenario: Durable architecture decision is accepted
- **WHEN** a design decision should outlive a single OpenSpec change
- **THEN** the workflow records or recommends recording a concise summary in codebase-memory ADR

### Requirement: ADR updates happen after landed changes
The workflow SHALL update or recommend updating codebase-memory ADR after a change has landed, as part of spec sync or archive guidance.

#### Scenario: Landed change has durable architecture impact
- **WHEN** a completed change is being synced or archived and includes durable architecture decisions
- **THEN** the workflow includes an ADR update or ADR update recommendation in the sync/archive path

### Requirement: Path-scoped guidance remains optional
Path-scoped guidance SHALL NOT be required when codebase-memory ADR provides sufficient architecture context.

#### Scenario: ADR provides sufficient context
- **WHEN** codebase-memory ADR accurately captures the relevant architecture and conventions
- **THEN** the workflow does not require generated path-scoped guidance

#### Scenario: Local convention is not captured by ADR
- **WHEN** a subtree has local conventions that codebase-memory ADR does not adequately capture
- **THEN** path-scoped guidance may document those conventions for injection on file touch

### Requirement: No duplicated architecture truth
The workflow SHALL avoid duplicating the same architecture content across OpenSpec artifacts, codebase-memory ADR, and path-scoped guidance.

#### Scenario: Related architecture information exists in multiple surfaces
- **WHEN** the same decision is relevant to multiple surfaces
- **THEN** secondary surfaces reference the canonical source instead of copying the full content

### Requirement: OpenSpec artifacts remain indexable
OpenSpec artifacts SHALL remain in canonical `openspec/changes/**` paths so codebase-memory can index them as repository context.

#### Scenario: Repository indexing runs
- **WHEN** codebase-memory indexes the repository
- **THEN** OpenSpec artifacts remain available in their canonical paths
