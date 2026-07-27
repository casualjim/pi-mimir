---
name: docs-crumbs
description: Search markdown docs and past conversations with Crumbs, and assemble anchored context packs. Use to find a section in README/ROADMAP/PLAN/TASKS, search the markdown docs, search the docs for, what does the doc say about, what did we discuss, find that past session, what did I say about, search past conversations, assemble context for a prompt, build a context pack. For CODE queries — callers, call chains, symbols, dependency paths, hotspots, cycles — use the `code-crumbs` skill instead.
---

# Crumbs — Docs, Sessions & Context

Everything here is `code_crumbs_`-prefixed. For anything about code structure — including
topology, dependency paths, hotspots, and cycles — use the `code-crumbs` skill.

## Markdown docs
`search_unified(query, mode, target, file_pattern)`
- `target`: `documents` (README/ROADMAP/PLAN/TASKS/`.md`) | `code` | `all`
- `mode`: `lexical` for keywords/identifiers · `semantic` for meaning · `hybrid` (default) fuses both + rerank

Slower than `search_code`. For source, reach for `search_code` first; use this when the answer
lives in prose, or when keyword search has already missed.

Beats reading a whole doc to find one section.

## Past conversations
`search_sessions(query, mode, limit)` — optional `role`, `since`, `session_id`.
Returns chunk snippets with a message pointer and token estimate, never full transcripts.
`session_ingest` pushes one finalized message (idempotent).

## Anchored context
`context(prompt, anchor…)` — anchors are file, symbol/key/section, or line.
Resolves anchors, pulls related files, selects regions within a token budget.
Knobs: `max_related_files`, `max_regions_per_file`, `token_budget`, `chars_per_token`.

## Project selection
Most tools take an optional `project` (name | slug | path) overriding the cwd-resolved project.
Omit it to use cwd. `list_projects` enumerates names; `config_doctor` checks whole-config readiness.
`list_projects` and `config_doctor` do not take `project`.

## CLI-only
Architecture drift is not exposed over MCP — use the CLI:
`crumbs graph snapshot > baseline.json`, later `crumbs graph diff baseline.json`.
Detects coupling drift, cycle growth, and refactor impact over time.
