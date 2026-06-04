# SPEC.md Routing for grill-with-docs

`SPEC.md` lives at project root and is the only durable truth doc. `cavekit-spec` is the only workflow that may mutate it.

## Non-negotiable rule

- Always treat project-root `SPEC.md` as canonical.
- Never edit `SPEC.md` directly from grill-with-docs.
- Route every `SPEC.md` creation/amendment through `cavekit-spec`.
- Never create or update `CONTEXT.md` or `CONTEXT-MAP.md`.
- Existing `CONTEXT.md`/`CONTEXT-MAP.md` files are read-only legacy sources. Propose relevant terms as `cavekit-spec` amendments, then ignore them.
- If `SPEC.md` is missing, invoke/use `cavekit-spec` to create it. No fallback doc.

## Cavekit-compatible sections

Keep Cavekit fixed section order. Do not add a glossary section.

```md
# SPEC

## §G GOAL
one line. what code must do.

## §C CONSTRAINTS
- bullet. non-negotiable boundary.
- bullet. locked language/term/tech constraint.

## §I INTERFACES
external surface. what world sees.
- cmd: `foo bar` → stdout JSON
- api: POST /x → 200 {id}
- file: `config.yaml` schema …
- env: `FOO_KEY` required

## §V INVARIANTS
numbered. testable. each ! MUST hold.
V1: ∀ req → auth check before handler

## §T TASKS
pipe table. ids monotonic. status: `x` done / `~` wip / `.` todo.
id|status|task|cites
T1|.|scaffold repo|-

## §B BUGS
pipe table. bug + invariant that catches recurrence.
id|date|cause|fix
B1|2026-04-20|token `<` not `≤`|V1
```

## Where grill amendments route

- Domain term resolved → `§C` language constraint.
- Boundary/scope decision → `§C` constraint.
- External/API/CLI/file/env surface → `§I` interface.
- Testable rule or regression guard → `§V` invariant.
- Follow-up implementation work → `§T` task.
- Bug found during grilling → `§B` only if user wants backprop recorded.

## Domain language encoding

Use compact bullets in `§C`:

```md
- term: Order = customer purchase intent tracked from placement to completion; avoid Purchase, Transaction
- term: Customer = person/org placing orders; avoid Client, Buyer, Account
```

Rules:

- Pick canonical term when synonyms compete.
- Keep definitions tight: one sentence.
- Include only project/domain concepts, not general programming concepts.
- Use `_Avoid_` only if existing `SPEC.md` already uses that style; otherwise use `avoid ...`.

## ADR relationship

ADRs may explain rationale. They are not the source of truth. When creating an ADR, route any resulting constraint/interface/invariant amendment through `cavekit-spec`.