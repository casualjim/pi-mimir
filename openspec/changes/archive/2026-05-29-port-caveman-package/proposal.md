## Why

Caveman already exists as a broad cross-agent plugin repository, but Pi users currently only get ad-hoc local skills rather than a first-class package in this monorepo. Porting it to `packages/pi-caveman` makes the full Caveman experience installable through Pi's package system while avoiding the upstream repository's non-Pi installer/plugin layers.

## What Changes

- Add a new Pi package at `packages/pi-caveman` that bundles the Caveman skills for Pi discovery.
- Port the full upstream Caveman skill set into Pi package conventions, including terse response mode, commit-message generation, review comments, memory-file compression guidance, stats/help, and cavecrew delegation guidance where compatible.
- Include supporting resources needed by those skills, such as cavecrew agent prompts or compression scripts, when they are required for feature parity.
- Preserve upstream attribution, license information, and links to the source project.
- Add package metadata and tests that verify Pi can discover the package and its skills.
- Exclude upstream global installers, shell hooks, statusline integrations, and non-Pi plugin manifests except as source material for the Pi-native package.

## Capabilities

### New Capabilities
- `pi-caveman-package`: A Pi package that provides the full Caveman skill set and supporting resources through Pi package discovery.

### Modified Capabilities

None.

## Impact

- Adds `packages/pi-caveman/` with package metadata, README, skill files, supporting resources, and tests.
- Updates workspace-level expectations only insofar as the new package participates in existing npm workspaces.
- No breaking changes to existing packages or OpenSpec capabilities.
- No runtime dependency on upstream Caveman installers or non-Pi agent plugin systems.
