---
name: cavecrew
description: >
  Decision guide for delegating to caveman-style subagents in Pi. Helps the main
  thread choose investigator, builder, or reviewer style delegation and keep
  subagent output compressed. Use when user says "delegate to subagent", "use
  cavecrew", "save context", or "compressed agent output".
---

Cavecrew = caveman-compressed delegation pattern. Same jobs as locator, surgical editor, reviewer; difference is output contract is terse so main context stays smaller.

This Pi port bundles upstream prompt resources in `agents/` as reference material. Actual execution depends on subagents configured in current Pi environment.

## Pi Subagent Rule

Before executing any subagent, call:

```json
{ "action": "list" }
```

Only execute agents listed as available and non-disabled. If matching cavecrew agents are not registered, either:
- use equivalent available agents with cavecrew output contract in task prompt, or
- perform work in main thread when delegation would add ambiguity.

## When to use cavecrew vs alternatives

| Task | Use |
|---|---|
| "Where is X defined / what calls Y / list uses of Z" | investigator-style subagent |
| Same but you also want suggestions/architecture commentary | normal exploration/main thread |
| Surgical edit, ≤2 files, scope obvious | builder-style subagent |
| New feature / 3+ files / cross-cutting refactor | main thread or implementation workflow |
| Review diff, branch, or file for bugs | reviewer-style subagent |
| Deep code review with rationale + alternatives | normal code review |
| One-line answer you already know | main thread, no subagent |

Rule: if you'd want subagent output in 1/3 tokens, pick cavecrew contract. If human-facing prose matters, use normal style.

## Output Contracts

### Investigator

```text
<Header>:
- path:line — `symbol` — short note
totals: <counts>.
```

Or `No match.` Always file-path-first, line-number-attached, backticked symbols. Safe to grep with `path:\d+`.

### Builder

```text
<path:line-range> — <change ≤10 words>.
verified: <re-read OK | mismatch @ path:line>.
```

Or one of: `too-big.` / `needs-confirm.` / `ambiguous.` / `regressed.` (terminal first token).

### Reviewer

```text
path:line: <emoji> <severity>: <problem>. <fix>.
totals: N🔴 N🟡 N🔵 N❓
```

Or `No issues.` Findings sorted file → line ascending.

## Chaining Patterns

### Locate → fix → verify

1. Investigator returns site list.
2. Main thread picks 1-2 sites, hands paths to builder.
3. Reviewer audits diff.

### Parallel scout

Spawn 2-3 investigator tasks in parallel with different angles: defs vs callers vs tests. Aggregate in main thread.

### Single-shot edit

Skip investigator when file/line already known. Hand exact path:line to builder directly.

## What NOT to do

- Don't use builder when you don't already know file. Spawn investigator first or main thread eats tokens passing context.
- Don't chain investigator → builder for 5-file refactor. Builder should return `too-big.`
- Don't ask reviewer for "general feedback"; it returns findings only, no architecture opinions.
- Don't expect prose. Cavecrew output is structured and terse. If human will read it directly, paraphrase.

## Bundled Prompt Resources

Reference prompt files live in package `agents/`:
- `cavecrew-investigator.md`
- `cavecrew-builder.md`
- `cavecrew-reviewer.md`

Use them as source material for task prompts or future Pi subagent registration.

## Auto-clarity

Subagents drop caveman → normal English for security warnings, irreversible-action confirmations, and any output where fragment ambiguity could be misread. Resume caveman after.
