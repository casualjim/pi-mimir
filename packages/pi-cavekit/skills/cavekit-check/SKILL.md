---
name: cavekit-check
description: Read-only Cavekit drift detector. Use when users invoke /ck:check, ask whether code matches SPEC.md, check invariants, audit interfaces, or inspect §T status evidence.
---

# cavekit-check — drift detector

Pure diagnostic workflow. Read `SPEC.md`, compare it to code, report evidence. Write nothing. Run after each `/ck:build` and before each ship — drift caught here is a diff; drift caught in prod is a §B.

Read bundled `../../FORMAT.md` before interpreting `SPEC.md` structure and addresses.

## Load

1. Read project-root `SPEC.md`. If missing, report `no SPEC.md, nothing to check` and stop.
2. Parse invocation args:
   - `§V` or no args → check invariants
   - `§I` → check interfaces
   - `§T` → audit task status against code evidence
   - `--all` → check §V, §I, and §T
3. Parse archive comments like `<!-- archive: .cavekit/archive/SPEC-<date>.md §T T1-T12 -->`.
4. Read referenced `.cavekit/archive/SPEC-*.md` copies when needed to resolve archived §V/§I cites, archived §T rows, or max-ID/range questions.

## Optional Cavecrew investigation

When evidence lookup needs code archaeology and `cavecrew-investigator` is available, use it for read-only compressed fact finding. Prefer it for locating §I implementations, §V enforcement/tests, §T status evidence, callers, and related files. The investigator must return file:line evidence only and must not design, fix, edit, or mutate state. If unavailable, use codebase-memory tools when available, then exact reads/search as fallback.

## Check §V — invariants

For each `V<n>` in current `SPEC.md`; with `--all`, include archived `V<n>` ranges referenced by archive comments:

1. Translate invariant into a verifiable claim about code/tests/config.
2. Search and read relevant files.
3. Classify: **HOLD** / **VIOLATE** / **UNVERIFIABLE**.
4. Cite file:line evidence when possible.

## Check §I — interfaces

For each interface item in current `SPEC.md`; with `--all`, include archived §I refs referenced by archive comments:

1. Locate implementation.
2. Classify:
   - **MATCH** — implemented shape matches spec.
   - **DRIFT** — implementation exists but shape differs.
   - **MISSING** — spec surface absent from code.
   - **EXTRA** — code exposes related surface absent from spec.
3. Cite file:line evidence.

## Check §T — tasks

For each task row in current `SPEC.md`; with `--all`, include archived §T rows referenced by archive comments:

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
