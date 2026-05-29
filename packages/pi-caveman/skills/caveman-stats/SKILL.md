---
name: caveman-stats
description: >
  Explain Caveman token-stats support in Pi. Upstream Caveman stats are powered by
  Claude Code hooks and session logs; this Pi package does not fake token savings.
  Triggers on /skill:caveman-stats or "caveman stats".
---

# Caveman Stats

Report stats support honestly. Do not estimate token savings.

## Pi Status

Upstream Caveman computes stats through Claude Code hook files:
- `hooks/caveman-stats.js`
- `hooks/caveman-mode-tracker.js`
- Claude Code session logs

This Pi package has Pi-native mode hooks, but they only activate/track Caveman mode. They do not install Claude Code hooks, read Claude Code logs, provide statusline stats, mutate non-Pi agent config, or expose measured token savings. Real Caveman token stats remain unavailable unless Pi exposes a reliable token/session-log API.

## Response Pattern

When invoked, say:

```text
Caveman stats unavailable in Pi package.
Pi-native hooks track mode only; no measured token stats API yet.
Upstream stats need Claude Code hooks/session logs.
No fake estimate.
```

If Pi later exposes a reliable token/session log API, use that source only. Never infer savings from response length or claim exact percentages for current session without measured data.
