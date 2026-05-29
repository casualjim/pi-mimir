# pi-caveman

Pi-native port of [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman): terse agent communication skills that reduce output tokens while keeping technical accuracy.

## Install

```text
pi install @casualjim/pi-caveman
```

For local development from this monorepo:

```text
pi install ./packages/pi-caveman
```

## Included skills

- `caveman` — persistent terse communication mode with `lite`, `full`, `ultra`, `wenyan-lite`, `wenyan-full`, and `wenyan-ultra` levels.
- `caveman-commit` — terse Conventional Commit message generator.
- `caveman-review` — terse, actionable code review comments.
- `caveman-compress` — compress natural-language memory files while preserving code, commands, paths, URLs, and structure.
- `caveman-help` — quick reference for package skills and modes.
- `caveman-stats` — documents stats support status for Pi.
- `cavecrew` — guidance for compressed subagent delegation in Pi.

Pi registers skills as `/skill:<name>` commands when skill commands are enabled. Natural-language triggers in each skill also work through normal skill discovery.

## Known limitations

This package ports Caveman behavior to Pi. It does not activate upstream installers, Claude Code hooks, statusline integrations, Codex/Gemini/Cursor plugin manifests, or any non-Pi agent configuration.

`caveman-stats` in upstream Caveman is implemented through Claude Code hooks. Pi does not expose that same hook/log path through this skills-only package, so stats are represented honestly rather than estimated. A future Pi extension could add native session-token stats.

`cavecrew` includes upstream prompt resources under `agents/`, but Pi subagent execution still depends on the subagents configured in the running Pi environment.

## Development

```bash
npm test --workspace @casualjim/pi-caveman
npm run typecheck --workspace @casualjim/pi-caveman
npm run test:e2e --workspace @casualjim/pi-caveman
```

The e2e test installs this package into an isolated Pi home and invokes representative skills through the real `pi` CLI.

## Attribution

This package is a Pi port of Caveman by Julius Brussee:

- Upstream: https://github.com/JuliusBrussee/caveman
- License: MIT, see `LICENSE`
