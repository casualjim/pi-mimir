# pi-caveman

Pi-native port of [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman): terse agent communication skills and Pi-native session hooks that reduce output tokens while keeping technical accuracy.

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

## Pi-native hooks

`pi-caveman` includes a Pi extension at `extensions/caveman` that mirrors upstream Claude Code hook behavior without installing Claude hooks or mutating `~/.claude`:

- `session_start` loads the default Caveman mode, writes safe Pi mode state, and injects filtered `skills/caveman/SKILL.md` rules as hidden context.
- `input` tracks `/skill:caveman`, `/skill:caveman <mode>`, `/skill:caveman-commit`, `/skill:caveman-review`, `/skill:caveman-compress`, natural-language enable/disable, `stop caveman`, and `normal mode`.
- `before_agent_start` reinforces active base Caveman mode each turn. Independent modes (`commit`, `review`, `compress`) do not inject base reply rules because their skills own behavior.

Default mode is `full`. Override with `CAVEMAN_DEFAULT_MODE` or config JSON at the Pi Caveman config path. Set `CAVEMAN_DEFAULT_MODE=off` to disable startup activation.

## Known limitations

This package ports Caveman behavior to Pi. It activates only the Pi-native extension hooks described above. It does not activate upstream installers, Claude Code hooks, statusline integrations, Codex/Gemini/Cursor plugin manifests, or any non-Pi agent configuration.

`caveman-stats` in upstream Caveman is implemented through Claude Code hooks and Claude transcript logs. The Pi extension does not fake token savings or read Claude logs. A future Pi stats/status API could add native session-token stats.

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
