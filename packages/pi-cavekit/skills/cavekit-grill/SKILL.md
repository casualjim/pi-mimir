---
name: cavekit-grill
description: Calibrated interrogation of a fuzzy idea before it becomes a spec. Asks one question at a time, recommends an answer, and lands each answer in §G or §C — unknowns parked as `?`, never guessed. Cheapest place to kill a bad idea is before §T exists. Use when users invoke /ck:grill, have a vague idea, or say "grill me", "stress-test this", "challenge my plan". Defers the write to cavekit-spec.
---

# cavekit-grill — sharpen idea before spec

One question at a time. Every answer lands in a § or gets parked `?`. Never guess a constraint into existence. Defers all `SPEC.md` writes to `cavekit-spec`.

Read bundled `../../FORMAT.md` before drafting §G/§C handoff content.

## When to grill

- Idea is one sentence and holes are felt.
- Multiple readings of the goal exist and one is about to be picked silently.
- Before `/ck:spec new` on anything non-trivial.
- User asks to be challenged or stress-tested.

Skip for a typo or one-line fix. Grill scales to uncertainty, ⊥ to ego.

## Calibrate first

One opening read, not a quiz. Use `ask_user_question` to calibrate, never a prose-only prompt:

1. How well does the user know this domain? (sets question depth)
2. How locked is the idea? (exploring vs committed)
3. Pressure wanted: light / normal / brutal.

Match it. Brutal grilling on a half-formed idea demoralizes. Light grilling on a committed plan misses the load-bearing flaw.

## Question ladder

Climb in order. Each rung, ask one question, recommend an answer, wait. Use `ask_user_question` with a recommended option first (suffix `(Recommended)`), 2-4 options.

1. Goal — what must the code do, one line? (→ §G)
2. Done — how do we know it works? name the observable. (→ §C / future §V)
3. Boundary — what is explicitly out of scope? (→ §C)
4. Lock — what tech/lib/pattern is non-negotiable? what is forbidden? (→ §C)
5. Surface — what does the outside world touch: cmd, api, file, env? (→ §I)
6. Edge — the one input that breaks the happy path? (→ future §V)
7. Unknown — what is not known yet? (→ park as `?` §C bullet)

Stop climbing the moment the spec would be unambiguous. Do not ask all seven by reflex.

## Answer format

Each question carries a recommended answer so the user can grunt "yes" and move. Put recommendation context in normal assistant text before the question; the question UI holds only the decision.

## Handoff

When done, emit a compact block — goal line, constraint bullets, surfaced unknowns as `?` — and hand to `cavekit-spec` to write §G/§C. `cavekit-grill` proposes; `cavekit-spec` is the sole mutator. Never write `SPEC.md` directly.

## When to stop

Done when all hold:

- §G is one line, one reading, zero "or maybe".
- §C covers every non-negotiable the user stated or implied.
- Every blocking unknown is either answered or parked as an explicit `?`.

Unresolved blocking unknown needing the outside world → recommend `/ck:research`, not a guess.

## Boundaries

- ⊥ make product decisions for the user. Recommend, never decide.
- ⊥ write `SPEC.md`. Hand structured answers to `cavekit-spec`.
- ⊥ ask in bulk. One question, one recommendation, wait.
- ⊥ grill a trivial change. Right-size or skip.
- Reference sibling skills by `cavekit-<verb>` names (e.g. `cavekit-spec`, `cavekit-research`), never upstream `skills/<verb>/SKILL.md` paths.
