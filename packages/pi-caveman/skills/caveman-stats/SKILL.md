---
name: caveman-stats
description: >
  Explain Caveman token-stats support in Pi. Upstream Caveman stats are powered by
  Claude Code hooks and session logs; this Pi skills-only package does not fake
  token savings. Triggers on /skill:caveman-stats or "caveman stats".
---

# Caveman Stats

Report stats support honestly. Do not estimate token savings.

## Pi Status

Upstream Caveman computes stats through Claude Code hook files:
- `hooks/caveman-stats.js`
- `hooks/caveman-mode-tracker.js`
- Claude Code session logs

This Pi package is skills-only. It does not install hooks, read Claude Code logs, or mutate non-Pi agent config. Therefore real Caveman token stats are unavailable here unless a future Pi extension adds native session-token integration.

## Response Pattern

When invoked, say:

```text
Caveman stats unavailable in Pi skills-only package.
Upstream stats need Claude Code hooks/session logs.
No fake estimate. Future Pi extension could add native token stats.
```

If Pi later exposes a reliable token/session log API, use that source only. Never infer savings from response length or claim exact percentages for current session without measured data.
