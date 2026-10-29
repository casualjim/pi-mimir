# pi-addy-skills

A pi-mimir port of [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (v0.6.13), for **pi and omp**. Production-grade engineering skills covering the full development lifecycle, the four reviewer personas, and the nine orchestration commands, adapted to the tools each host actually ships.

## Install

```text
pi install npm:@casualjim/pi-addy-skills      # pi
omp plugin install @casualjim/pi-addy-skills  # omp
```

Local development from this checkout uses `pi install ./packages/pi-addy-skills` or `omp plugin link ./packages/pi-addy-skills`.

## What's included

- **25 skills** under `skills/`, matching the upstream inventory, including the `using-agent-skills` meta-skill. Each skill keeps the upstream workflow and gains an `## omp tooling` section that maps the workflow onto omp's built-in surfaces: the codebase-memory graph for investigation, `xd://ast_grep`/`xd://ast_edit` for structural search and codemods, `xd://lsp` for references, `xd://debug` (DAP) for live debugging, the `browser` global in eval kernels for real-page verification, `task` agents for fan-out, `judge`/`judge_batch` for typed verdicts, `ask` for interviews, `xd://dredd_remember` for enforced constraints, and `pr://`/`xd://github` for PR and CI state.
- **4 reviewer personas** under `agents/` (`code-reviewer`, `security-auditor`, `test-engineer`, `web-performance-auditor`). omp discovers them natively as `task` agents from the package's `agents/` directory. On pi, the bundled extension publishes the same directory as a pi-herdr-agents role pack via the `pi-herdr-subagents:roles:discover:v1` event, so `subagent({ agent: "code-reviewer", ... })` resolves there too.
- **9 commands** under `commands/`, the upstream slash commands ported once for both hosts. Address them as `/as:build` and friends: omp scans a plugin's `commands/` directory into its slash surface, and pi loads the same files as prompt templates because `pi.prompts` points at `./commands`. Invoked set: `as:build`, `as:code-simplify`, `as:constraints`, `as:plan`, `as:review`, `as:ship`, `as:spec`, `as:test`, `as:webperf`. `as:ship` fans the three reviewer personas out in a single parallel `task` call on omp (three `subagent` calls in one turn on pi) and merges their reports into a go/no-go decision.
- **7 shared reference docs** under `references/` (checklists for security, performance, accessibility, observability, testing, orchestration, and the definition of done), keeping the upstream `../../references/...` link layout intact.

## Model selection

No agent or prompt pins a concrete model. Personas inherit the session model; cross-model workflows (doubt-driven escalation) use omp model **roles** (`@slow`, `@judge`, `@default`) or pi-herdr-agents' role config, so the user's model configuration stays the single source of truth.

## What's removed vs upstream

- `hooks/` (session-start injection, simplify-ignore, sdd-cache). Upstream does not wire them in its plugin manifest either; pi and omp route skills natively from descriptions, and the cache hooks depend on Claude's WebFetch hook events.
- Repo-development assets: `scripts/`, `evals/`, `docs/`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and the host adapter directories (`.claude*`, `.codex-plugin`, `.gemini`, `.opencode`, `.agents`).
- The `commands/*.toml` duplicates; the `.claude/commands/*.md` bodies are the ported source.
- Claude-specific mechanics in prose: `subagent_type`/Agent-tool dispatch is rewritten for the omp `task` tool and pi-herdr `subagent`, `Claude Code` host references are generalized, and `CLAUDE.md` mentions become `AGENTS.md (or CLAUDE.md)`.

## Tests

```sh
pnpm test       # bun contract checks: personas, role pack, skills, prompts, link resolution
pnpm typecheck  # tsc --noEmit over extensions/ and tests/
```

## License and provenance

Derived from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) v0.6.13, licensed under MIT. See [LICENSE](LICENSE).
