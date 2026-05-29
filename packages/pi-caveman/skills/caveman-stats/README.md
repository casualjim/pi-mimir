# caveman-stats

Pi stats status. Honest, no fake estimates.

## What it does

Explains that real Caveman token statistics are unavailable in this Pi skills-only package.

Upstream Caveman stats depend on Claude Code hooks and Claude Code session logs. This Pi package does not install hooks, read Claude Code logs, write statusline files, or mutate non-Pi agent configuration. It also does not estimate savings from response length.

A future Pi extension could add native token/session-log integration. Until then, this skill reports the limitation clearly.

## How to invoke

```text
/skill:caveman-stats
```

Also triggers on "caveman stats".

## Response pattern

```text
Caveman stats unavailable in Pi skills-only package.
Upstream stats need Claude Code hooks/session logs.
No fake estimate. Future Pi extension could add native token stats.
```

## See also

- [`SKILL.md`](./SKILL.md) — LLM-facing Pi limitation contract
- [Caveman README](../../README.md) — package overview
