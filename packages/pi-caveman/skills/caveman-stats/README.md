# caveman-stats

Pi stats status. Honest, no fake estimates.

## What it does

Explains that real Caveman token statistics are unavailable in this Pi package.

Upstream Caveman stats depend on Claude Code hooks and Claude Code session logs. This Pi package has Pi-native mode hooks, but they only activate/track Caveman mode. They do not install Claude Code hooks, read Claude Code logs, write statusline stats, mutate non-Pi agent configuration, or estimate savings from response length.

A future Pi stats/status API could add native token/session-log integration. Until then, this skill reports the limitation clearly.

## How to invoke

```text
/skill:caveman-stats
```

Also triggers on "caveman stats".

## Response pattern

```text
Caveman stats unavailable in Pi package.
Pi-native hooks track mode only; no measured token stats API yet.
Upstream stats need Claude Code hooks/session logs.
No fake estimate.
```

## See also

- [`SKILL.md`](./SKILL.md) — LLM-facing Pi limitation contract
- [Caveman README](../../README.md) — package overview
