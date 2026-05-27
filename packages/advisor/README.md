# pi-mimir advisor

Forked child advisor package for Pi and pi-mimir.

## What it provides

- `/advisor` to configure an advisor model and optional reasoning effort.
- An `advisor` tool that forks from the current session branch and asks a stronger model for concise guidance.
- Bundled `advisor-child` agent delivery into `.pi/agents/`.
- Off-by-default activation, explicit disable support, and per-executor blocklist support through config.

## Behavior

Unlike `rpiv-advisor`, this package does not use an in-process `completeSimple` side-call.
It creates a forked child session, preserves the parent branch context, and returns only:

- `PLAN`
- `CORRECTION`
- `STOP`

The advisor child is read-only and cannot recurse through the `advisor` tool.

## Install

Install the package in Pi, then configure it in a session with:

```text
/advisor
```

## Notes

- The advisor remains inactive until a model is configured.
- The child lane inherits branch context; it is isolated execution, not narrow context.
- The package relies on Pi forked-session behavior. If a parent session is not persisted yet, advisor calls fail clearly instead of silently degrading.

## Development

Run tests from `packages/advisor`:

```bash
npm test
npm run typecheck
```
