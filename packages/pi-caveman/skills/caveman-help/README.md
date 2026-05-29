# caveman-help

Quick-reference card. One shot, no mode change.

## What it does

Prints a cheat sheet of all Caveman modes, bundled Pi skills, deactivation triggers, and package limitations. One-shot display — does not flip active mode, write flag files, or persist anything. Use when you forget the Pi skill commands.

## How to invoke

```text
/skill:caveman-help
```

Also triggers on "caveman help", "what caveman commands", "how do I use caveman".

## Example output

```text
Modes:
  /skill:caveman              full (default)
  /skill:caveman lite         lighter
  /skill:caveman ultra        extreme
  /skill:caveman wenyan-full  classical Chinese

Skills:
  /skill:caveman-commit       terse Conventional Commits
  /skill:caveman-review       one-line PR comments
  /skill:caveman-compress     compress memory files safely
  /skill:caveman-stats        Pi stats status, no fake estimates
  /skill:cavecrew             compressed subagent delegation guide

Deactivate:
  "stop caveman" or "normal mode"
```

Pi package install/discovery replaces upstream Caveman installers. This port does not install Claude Code hooks, shell statuslines, Codex/Gemini manifests, or other non-Pi plugin configs.

## See also

- [`SKILL.md`](./SKILL.md) — full reference card
- [Caveman README](../../README.md) — package overview
