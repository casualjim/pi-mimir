---
name: cavekit-backprop
description: Cavekit bug-to-spec protocol. Use on test failures, user bug reports, post-mortems, or /ck:check violations to trace root cause and decide what §B and §V updates should be made through cavekit-spec.
---

# cavekit-backprop — bug → spec memory

Plan-then-execute fixes code and forgets. Cavekit backprop fixes code and updates `SPEC.md` so recurrence is harder.

Backprop analysis is usually paired with `cavekit-spec`, which performs approved `SPEC.md` mutations.

Read bundled `../../FORMAT.md` before drafting §B or §V entries.

## When to backprop

- `/ck:build` verification fails.
- User reports a bug.
- Post-mortem after incident.
- `/ck:check` flags VIOLATE or DRIFT and root cause is found.

## Six steps

### 1. Trace

Read failure output or bug report. Find exact file:line or behavior boundary. Name root cause in one concise sentence.

### 2. Analyze

Ask:

- Would a new §V invariant catch this class of bug?
- Is §I wrong because the spec claimed the wrong external shape?
- Is §T wrong because the task built the wrong work?
- Is this a one-off mechanical typo or external dependency issue where §V would add noise?

### 3. Propose spec change

Draft changes. Do not silently apply unless the user explicitly requested direct mutation.

Template:

```text
§B row: B<next>|<date>|<root cause>|V<N>
§V line: V<next>: <testable rule that would have caught it>
```

If no invariant is useful, use `-` in the §B fix cell and explain why.

Example:

```text
§B row: B3|2026-04-20|refund job ran twice on retry|V7
§V line: V7: ∀ refund → idempotency key check before charge reversal
```

### 4. Generate or update test plan

New invariant without verification is weak. Propose a test or check that cites the invariant, for example `TestV7_RefundIdempotent`.

### 5. Verify

If implementation work is in scope, fix code and run the targeted test plus appropriate suite. If this skill is being used for analysis only, hand the test/code work back to `/ck:build`.

### 6. Log

Use `cavekit-spec` to append §B and §V/§T changes after user approval. Do not commit automatically; commit only when explicitly requested by the user in this session.

## Good invariant qualities

- Testable in code, config, or observable behavior.
- Scoped to behavior rather than one file.
- Stated positively when possible.
- References §I surface where applicable.
- Short enough to stay useful in every future Cavekit invocation.

Bad:

```text
V8: code should be correct.
```

Good:

```text
V8: ∀ pg_query ! params via driver, ⊥ string concat.
```

## When not to add §V

- Pure one-off typo with no recurring class.
- One-time migration.
- External dependency failure where the fix is a dependency pin/upgrade.

Still record a §B entry so future similar failures have precedent.

## Output shape

Every backprop analysis should produce:

1. root cause;
2. proposed §B row;
3. proposed §V entry when useful;
4. proposed test/check;
5. next action: `/ck:spec bug: ...`, `/ck:build ...`, or fix code.
