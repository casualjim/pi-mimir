# pi-pstack

A pi-mimir fork of [pstack](https://github.com/cursor/plugins/tree/main/pstack). It keeps all upstream skills that are platform-portable (46; `make-bot-ui` is Cursor-platform-only and excluded), the sticky Poteto Mode, and the bundled `poteto-agent` and `comment-sicko` agents — but it delegates through [pi-herdr-agents](https://github.com/giuseppecrj/pi-herdr-agents) instead of shipping its own `subagent` tool.

## Why this fork exists

Upstream pi-pstack registers a tool named `subagent`. pi-herdr-agents registers a tool with the same name. Loading both made one shadow the other. This fork drops the `subagent` tool registration entirely so pi-herdr-agents' `subagent` is the only one, and pstack's bundled agents become inputs to it.

## How delegation works here

pi-herdr-agents resolves roles from bundled, role-pack, global, and project definitions. This extension publishes its bundled `agents/` directory as a role pack, registering it on the `pi-herdr-subagents:roles:discover:v1` event when the extension loads. The host reads and validates the definitions in place, so nothing is copied into `~/.pi/agent/agents`.

After install, check the roles with `subagents_list` and delegate the pi-herdr-agents way:

```text
subagent({ name: "Fix retry regression", agent: "poteto-agent", task: "investigate and fix the retry regression, then verify it" })
```

`poteto-agent` self-instructs to read the bundled `poteto-mode` skill in full before working, so the behavior upstream got via prompt injection is preserved without this fork injecting anything.

## What's included

- 46 skills under `skills/`, matching the upstream inventory minus Cursor-only `make-bot-ui` (prose adapted where Pi differs).
- `poteto-agent` and `comment-sicko` agent definitions under `agents/`, published to pi-herdr-agents as a role pack.
- Commands: `/poteto-mode` (sticky Poteto Mode for the session).
- Tools: none. Task tracking, session recall, and subagent model routing use the host environment (`set_tasks` family, `recall`, `subagents_write_task_models`).

## What's removed vs upstream

- The `subagent` tool and its child-Pi process runner. Use pi-herdr-agents' `subagent` instead.
- `/setup-pstack`, `pstack_config`, `pstack_todo`, `pstack_sessions`, and the `~/.pi/agent/pstack/models.json` role map. The live role-to-model routing is pi-herdr-agents' `models.tasks`/`models.agents` config (`subagents_write_task_models`). Workflow skills consult that config for the per-call `model` they pass to `subagent`. Panel roles take model lists; set those via `models.agents` per agent or `task:<category>` routing.

## Safety

The extension requests confirmation for recognizable shell commands that push, alter pull requests, merge, deploy, mutate infrastructure, or recursively delete files. In non-interactive mode it blocks these commands. This is a guardrail, not a complete shell-security sandbox.

## License and provenance

Derived from Cursor's pstack, licensed under MIT. See [LICENSE](LICENSE).
