---
name: cavekit-check
description: Read-only Cavekit drift detector. Use when users invoke /ck:check, ask whether code matches SPEC.md, check invariants, audit interfaces, or inspect §T status evidence.
---

# cavekit-check — drift report

Pure diagnostic workflow. Read `SPEC.md`, compare it to code, report evidence. Write nothing.

Read bundled `../../FORMAT.md` before interpreting `SPEC.md` structure and addresses.

## Load

1. Read project-root `SPEC.md`. If missing, report `no SPEC.md, nothing to check` and stop.
2. Parse invocation args:
   - `§V` or no args → check invariants
   - `§I` → check interfaces
   - `§T` → audit task status against code evidence
   - `--all` → check §V, §I, and §T

## Check §V — invariants

For each `V<n>`:

1. Translate invariant into a verifiable claim about code/tests/config.
2. Search and read relevant files.
3. Classify: **HOLD** / **VIOLATE** / **UNVERIFIABLE**.
4. Cite file:line evidence when possible.

## Check §I — interfaces

For each interface item:

1. Locate implementation.
2. Classify:
   - **MATCH** — implemented shape matches spec.
   - **DRIFT** — implementation exists but shape differs.
   - **MISSING** — spec surface absent from code.
   - **EXTRA** — code exposes related surface absent from spec.
3. Cite file:line evidence.

## Check §T — tasks

For each task row:

1. If status `x`, verify claimed work appears present.
2. If status `~`, note as in-progress.
3. If status `.`, note as pending.
4. Flag `x` rows with no supporting evidence as **STALE**.

## Report format

Use concise grouped output:

```text
## §V drift
V2 VIOLATE: auth/mw.go:47 uses `<` not `≤`. see §B.1.
V5 UNVERIFIABLE: no test covers req path.

## §I drift
I.api DRIFT: POST /x returns `{result}` not `{id}`. route.go:112.
I.cmd MISSING: `foo bar` absent from cli/*.go.

## §T drift
T3 STALE: status `x`, no middleware file exists.

## summary
2 violate. 1 missing. 1 stale. 1 unverifiable.
next: /ck:spec bug: <cause>, /ck:build <task>, or amend spec.
```

## Remedy hints only

End with one-line hints:

- VIOLATE / DRIFT → use `/ck:spec bug: <cause>` or fix code.
- MISSING → use `/ck:build §T.n` if a task exists; otherwise `/ck:spec amend §T`.
- STALE → use `/ck:spec amend §T` to uncheck or revise.
- EXTRA → document with `/ck:spec amend §I` or remove code.

## Boundaries

- Zero writes.
- No `SPEC.md` edits.
- No code edits.
- No commits.
- No scores or grades; classify by evidence.
