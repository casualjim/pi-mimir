# pi-pstack

A pi-mimir fork of [pstack](https://github.com/cursor/plugins/tree/main/pstack). It keeps all 44 upstream skills, the sticky Poteto Mode, and the bundled `poteto-agent` and `comment-sicko` agents — but it delegates through [pi-subagents](https://github.com/nicobailon/pi-subagents) instead of shipping its own `subagent` tool.

## Why this fork exists

Upstream pi-pstack registers a tool named `subagent`. pi-subagents registers a tool with the same name. Loading both made one shadow the other. This fork drops the `subagent` tool registration entirely so pi-subagents' `subagent` is the only one, and pstack's bundled agents become inputs to it.

## How delegation works here

pi-subagents discovers agents from `~/.pi/agent/agents`, not from pi package manifests. On `session_start`, this extension syncs its bundled `agents/*.md` there as managed copies (content-addressed manifest at `~/.pi/agent/pstack-managed.json`). Locally-edited copies are preserved and become user-owned.

After install, call delegation the pi-subagents way:

```text
subagent({ agent: "poteto-agent", task: "investigate and fix the retry regression, then verify it" })
```

`poteto-agent` self-instructs to read the bundled `poteto-mode` skill in full before working, so the behavior upstream got via prompt injection is preserved without this fork injecting anything.

## What's included

- 44 skills under `skills/`, unchanged from upstream.
- `poteto-agent` and `comment-sicko` agent definitions under `agents/`, synced to `~/.pi/agent/agents/`.
- Commands: `/poteto-mode` (sticky Poteto Mode for the session) and `/setup-pstack` (map pstack roles to models; if no `verify-*` skill or test harness is found, it offers to generate one via `/skill:create-verification-skill`).
- Tools: `pstack_todo`, `pstack_sessions`, `pstack_config`.

## What's removed vs upstream

- The `subagent` tool and its child-Pi process runner. Use pi-subagents' `subagent` instead.
- `/setup-pstack` and `pstack_config` write a role-to-model map to `~/.pi/agent/pstack/models.json`. The workflow skills (how, why, reflect, swarm, arena, interrogate, architect) consult this map to pick the per-call `model` they pass to pi-subagents' `subagent`. pstack uses one agent (`poteto-agent`) with role-varying models, and panel roles are lists (one subagent per entry), so `settings.json` `subagents.agentOverrides` (one model per agent name) can't express it. Panel roles are configured as arrays by editing the JSON directly; `/setup-pstack` sets single-model roles interactively.

## Safety

The extension requests confirmation for recognizable shell commands that push, alter pull requests, merge, deploy, mutate infrastructure, or recursively delete files. In non-interactive mode it blocks these commands. This is a guardrail, not a complete shell-security sandbox.

## License and provenance

Derived from Cursor's pstack, licensed under MIT. See [LICENSE](LICENSE).