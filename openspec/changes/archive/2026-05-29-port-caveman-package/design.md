## Context

The upstream Caveman repository is a multi-harness distribution: it contains Agent Skills, command definitions, helper scripts, hook/statusline integrations, installers, and plugin manifests for many AI coding agents. Pi already supports package discovery for skills through `package.json` metadata and conventional `skills/` directories, so the port should translate the useful Caveman behavior into a Pi-native package rather than carrying over the upstream installer architecture.

Existing packages in this monorepo use one package per Pi integration under `packages/*`, declare `keywords: ["pi-package"]`, and expose resources with the `pi` manifest. The closest local pattern is `packages/pi-codebase-memory`, which ships package metadata, a `skills/` tree, README, tests, and optional extension code.

## Goals / Non-Goals

**Goals:**

- Provide a first-class `packages/pi-caveman` package installable by Pi package mechanisms.
- Port the full upstream Caveman skill set where it has Pi value: `caveman`, `caveman-commit`, `caveman-review`, `caveman-compress`, `caveman-help`, `caveman-stats`, and `cavecrew` guidance.
- Include supporting resources required by ported skills, such as compression scripts and cavecrew agent prompt files, when the skill would otherwise point at missing files.
- Preserve Caveman behavior and tone while adapting triggers and operational instructions to Pi's tool names, skill discovery, and package model.
- Preserve upstream attribution and license details in package documentation.
- Add tests that guard package registration and skill/resource presence.

**Non-Goals:**

- Do not port upstream global installers (`install.sh`, `install.ps1`, `bin/install.js`) as active Pi install paths.
- Do not install or emulate Claude Code/Codex/Gemini/Cursor plugin manifests, shell hooks, or statusline integrations unless a Pi-native equivalent is explicitly added later.
- Do not change Pi core skill-loading behavior.
- Do not implement persistent session mode state outside normal skill instructions unless Pi already provides a supported mechanism for it.

## Decisions

### Decision: Ship a Pi-native package, not a wrapper around upstream installers

`packages/pi-caveman/package.json` will follow the existing monorepo package pattern with `keywords: ["pi-package"]` and `pi.skills: ["skills"]`. This makes Pi responsible for discovery and avoids invoking upstream installers that target other agent config formats.

Alternatives considered:
- Running upstream `caveman` installer from the package: rejected because it mutates many non-Pi agent configs and duplicates Pi's package installer.
- Keeping Caveman as a local user skill only: rejected because it does not produce a reusable monorepo package.

### Decision: Port all skill-facing behavior, but adapt non-Pi mechanics

All upstream skill directories should be reviewed and represented in the Pi package. Skills with direct prompt behavior can be copied with minimal adaptation. Skills that reference non-Pi hooks or command systems should be rewritten into Pi-appropriate guidance or marked as limited if no Pi-native runtime exists.

Examples:
- `caveman`, `caveman-commit`, `caveman-review`, and `caveman-help` are prompt-only skills and should port directly with trigger wording adjusted for Pi.
- `caveman-compress` can include its adjacent scripts if present, but must use Pi's available tools and safety constraints in the instructions.
- `caveman-stats` depends upstream on Claude Code hook log parsing; in Pi it should either provide Pi-specific instructions if a session-log source exists or clearly report that upstream hook-based stats are unavailable until a Pi extension is added.
- `cavecrew` should map upstream subagent concepts to Pi's subagent tooling and bundled agent prompt resources where practical.

Alternatives considered:
- Only porting the three currently-installed skills: rejected because the requested scope is a full port.
- Blind copying every upstream file: rejected because most of the repository is non-Pi plugin plumbing and would confuse package behavior.

### Decision: Keep extension code optional unless needed for parity

The initial package should be skill-first. Add an extension only if a ported capability cannot work through skill instructions and bundled resources alone, such as Pi-specific stats gathering or command aliases. If no extension is needed, keep the package simple and testable as a skills package.

Alternatives considered:
- Building a mode/state extension immediately: deferred because Caveman's core value is prompt behavior and Pi skill invocation already covers that path.
- Porting hook/statusline code as-is: rejected because it is Claude Code-specific.

### Decision: Test the package contract, not Caveman prose quality

Tests should assert that the package manifest exposes Pi skills, required skill files/resources exist, frontmatter names are valid and unique, and documentation/attribution files are present. They should not attempt to benchmark token savings or judge model prose style.

Alternatives considered:
- Reusing upstream evals: rejected for this package because they measure behavior outside the packaging contract and add heavyweight dependencies.

## Risks / Trade-offs

- Upstream skills may reference Claude-specific hooks or commands → adapt those sections to Pi and document any deferred parity gaps.
- “Full port” could be mistaken for “copy every plugin target” → define full as full Caveman capability surface for Pi, not full multi-agent installer ecology.
- Caveman mode persistence is prompt-enforced, not runtime-enforced → document that persistence lasts through the active conversation unless Pi later adds explicit session state support.
- Compression scripts may depend on Claude-specific CLI assumptions → inspect before inclusion and either adapt them to Pi-safe commands or mark compression as instruction-driven with implementation deferred.
- Cavecrew agents may not map one-to-one to Pi subagent definitions → bundle source prompt resources and adapt `cavecrew` instructions to available Pi subagent workflows.
