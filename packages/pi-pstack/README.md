# pi-pstack

A pi-mimir fork of [pstack](https://github.com/cursor/plugins/tree/main/pstack), for **pi and omp**. It keeps every upstream skill except the Cursor-platform-only `make-bot-ui` (57; `setup-pstack` is adapted to pi-herdr-agents routing instead of Cursor's model rule), the sticky Poteto Mode, and the bundled `poteto-agent` and `comment-sicko` agents — but it delegates through [pi-herdr-agents](https://github.com/giuseppecrj/pi-herdr-agents) instead of shipping its own `subagent` tool.

## Install

```text
pi install npm:@casualjim/pi-pstack      # pi
omp plugin install @casualjim/pi-pstack  # omp
```

Local development from this checkout uses `pi install ./packages/pi-pstack` or `omp plugin link ./packages/pi-pstack`.

## Why this fork exists

Upstream pi-pstack registers a tool named `subagent`. pi-herdr-agents registers a tool with the same name. Loading both made one shadow the other. This fork drops the `subagent` tool registration entirely so pi-herdr-agents' `subagent` is the only one, and pstack's bundled agents become inputs to it.

## How delegation works here

pi-herdr-agents resolves roles from bundled, role-pack, global, and project definitions. This extension publishes its bundled `agents/` directory as a role pack, registering it on the `pi-herdr-subagents:roles:discover:v1` event when the extension loads. The host reads and validates the definitions in place, so nothing is copied into the host agent directory's `agents/`.

After install, check the roles with `subagents_list` and delegate the pi-herdr-agents way:

```text
subagent({ name: "Fix retry regression", agent: "poteto-agent", task: "investigate and fix the retry regression, then verify it" })
```

`poteto-agent` self-instructs to read the bundled `poteto-mode` skill in full before working, so the behavior upstream got via prompt injection is preserved without this fork injecting anything.

## What's included

- 57 skills under `skills/`, matching the upstream inventory minus Cursor-only `make-bot-ui` (`setup-pstack` adapted to `subagents_write_task_models`; prose adapted where the host differs). New in this sync: one-file `why`, `how`, `reflect`, and `architect` per upstream; `worker.md` kickoff rules for spawned agents; Orchestrate removed (figure-it-out covers program-scale work); statechart gained SANY error reporting with line/column and parent-border arrow drawing.
- `poteto-agent` and `comment-sicko` agent definitions under `agents/`, published to pi-herdr-agents as a role pack.
- Commands: `/skill:poteto-mode` (sticky Poteto Mode for the session).
- Tools: none. Task tracking, session recall, and subagent model routing use the host environment (`set_tasks` family, `recall`, `subagents_write_task_models`).

## What's removed vs upstream

- The `subagent` tool and its child-process runner. Use pi-herdr-agents' `subagent` instead.
- The old `/setup-pstack`, `pstack_config`, `pstack_todo`, `pstack_sessions`, and the `pstack/models.json` role map in the host agent directory. `/skill:setup-pstack` now configures pi-herdr-agents' `models.tasks`/`models.agents` (`subagents_write_task_models`) and offers the verification-skill generators. Workflow skills consult that config for the per-call `model` they pass to `subagent`. Panel roles take model lists; set those via `models.agents` per agent or `task:<category>` routing.

The statechart suite's differential tier (real TLC) needs the TLA+ tools. `mise run test` fetches `tla2tools.jar` into `.tools/` and exports `TLA2TOOLS` for you; without it, those tests self-skip. CI fetches the same jar.

## Safety

The extension requests confirmation for recognizable shell commands that push, alter pull requests, merge, deploy, mutate infrastructure, or recursively delete files. In non-interactive mode it blocks these commands. This is a guardrail, not a complete shell-security sandbox.

For agent questions, pstack prefers the active `ask` tool on omp and `ask_user` before `ask_user_question` on Pi. Shell approvals use the omp ask dialog when the tool is active and the UI supports it. Otherwise they use `ctx.ui.confirm`. Pi approval hooks cannot invoke the questionnaire tools and keep native confirmation. Cancelling or timing out does not authorize the command.

To run without approval prompts, set `confirmExternalActions` to `false` in the pstack config file: `$PI_CODING_AGENT_DIR/pstack/config.json` when that env var is set, otherwise `~/.omp/agent/pstack/config.json` under omp or `~/.pi/agent/pstack/config.json` under pi (same resolution as pi-headroom's settings). Restart the host after a config change. A missing, malformed, or non-boolean config keeps the guard enabled. With the guard disabled, agents are told to run recognized external commands without asking and still pause for irreversible writes (force-pushes to shared branches, deployments, data deletion, customer messages).

## License and provenance

Derived from Cursor's pstack, licensed under MIT. See [LICENSE](LICENSE).
