---
name: cavekit-spec
description: Create, distill, amend, or backprop bugs into project-root SPEC.md using Cavekit FORMAT.md. Use when users invoke /ck:spec, ask to write a Cavekit spec, amend §G/§C/§I/§V/§T/§B, distill a spec from code, or record a bug via backprop.
---

# cavekit-spec — SPEC.md mutator

This is the sole Cavekit workflow that mutates project-root `SPEC.md` content beyond task status flips.

Read bundled `../../FORMAT.md` before writing or checking spec structure. That file defines the `SPEC.md` schema, addressing rules, pipe-table rules, and caveman-style encoding for spec content. The bundled `FORMAT.md` is reference material; the working `SPEC.md` lives at the user's project root.

## Dispatch

Inspect the user's request and project state:

1. No `SPEC.md` at project root AND request describes an idea → **NEW**
2. No `SPEC.md` at project root AND request includes `from-code` → **DISTILL**
3. `SPEC.md` exists AND request starts with or clearly means `bug:` → **BACKPROP**
4. `SPEC.md` exists AND request starts with or clearly means `amend` → **AMEND**
5. `SPEC.md` exists and no mode is clear → ask which mode

## NEW — idea → spec

Input: user idea.

Steps:

1. Extract goal as one caveman-format line → §G.
2. List stated or implied non-negotiable constraints → §C.
3. List external surfaces the user named or the code clearly exposes → §I.
4. Propose initial testable invariants → §V numbered `V1...`.
5. Break goal into ordered tasks → §T pipe table with status `.`, ids `T1...`, and `cites` entries for relevant §V/§I refs.
6. Create §B with only header row: `id|date|cause|fix`.

Write `SPEC.md` at project root. Show the full file and ask: `spec OK? suggest edits or invoke /ck:build.`

## DISTILL — code → spec

Walk the current repo. Produce:

- §G: infer from README, package metadata, main entrypoints, or obvious behavior.
- §C: infer stack, language, runtime, and locked constraints.
- §I: enumerate public CLIs, APIs, config files, env vars, files, or package exports.
- §V: derive from tests, assertions, validation code, and security/performance invariants.
- §T: one task per known TODO, missing test, incomplete edge, or uncertain item.
- §B: empty bug log with header row.

Use `?` to flag uncertain inferred facts so the user can confirm.

## BACKPROP — bug → §B + usually §V

For bug reports, use `cavekit-backprop` analysis. Then apply approved SPEC.md changes here:

1. Parse bug description and root cause.
2. Decide whether a new invariant would catch recurrence.
3. Append §B row: `B<next>|<date>|<cause>|V<N>` or `-` if no invariant.
4. Append §V line when useful.
5. Add or update §T rows if behavior or tests are now required.
6. Show the diff. Apply only after user approval unless the user explicitly requested direct mutation.

Every considered bug gets a §B entry. A §V invariant is preferred when the bug represents a class of recurrence.

## AMEND — targeted edit

Input examples: `amend §V.3`, `amend §T`, `amend interfaces`.

1. Read the named section or item.
2. Show current content.
3. Ask for the desired change if not already specified.
4. Edit only the named section or item.
5. Show diff.

Never silently rewrite sections the user did not name.

## Output rules

- Follow bundled `../../FORMAT.md`.
- Use caveman-style encoding for SPEC.md content only.
- Preserve code, paths, identifiers, URLs, numbers, error strings, SQL, regex, JSON, and YAML verbatim.
- Numbering is monotonic: never reuse §V, §T, or §B ids.
- Escape literal `|` in pipe-table cells as `\|`.
- `§T` rows use `id|status|task|cites` and status values `.`, `~`, `x`.

## Boundaries

- Do not edit application code from this skill.
- Do not auto-run `/ck:build` after spec creation.
- Do not commit unless the user explicitly asks in this session.
- Do not require `pi-caveman`; Cavekit spec encoding is defined by bundled `FORMAT.md`.
