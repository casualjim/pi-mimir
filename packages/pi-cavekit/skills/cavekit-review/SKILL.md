---
name: cavekit-review
description: Adversarial senior review of the spec before any code is written. Constructs a skeptical reviewer whose authority comes from the codebase, §R research, and live best-practice — then tries to REFUTE the spec, not rubber-stamp it. Every finding cites evidence; unverifiable ones are flagged. Survivors harden §V; the run ends in an explicit go/no-go gate. Use when users invoke /ck:review, say "review the spec", "red-team this", or ask "is this plan sound".
---

# cavekit-review — refute the spec before build

Every finding cites evidence — file:line or a source. No evidence → flag `[unverified]`. Default to refuted: a flaw that cannot be proved is a flaw noted, not waved through. Defers all `SPEC.md` writes to `cavekit-spec`.

Read bundled `../../FORMAT.md` before interpreting §G §C §I §R §V §T.

## When to review

- Before `/ck:build` on a high-blast-radius change (shared module, auth, data, money, public §I).
- Spec touched §I or §V that other code depends on.
- Right-sizing says the cost of a wrong build > the cost of one review pass.

Skip for a trivial, reversible, well-understood change. Adversarial review on a typo hallucinates flaws and wastes the budget.

## Phase 0 — capture

Read the spec: §G §C §I §R §V §T. Hold the whole thing. Review the spec, not memory of the conversation. If `cavecrew-investigator` is available, use it for read-only compressed codebase facts (patterns, existing invariants, callers); it must not design or edit.

## Phase 1 — construct the senior

Build a reviewer with real authority, not a generic critic:

- Codebase — grep/read the modules this spec touches. What patterns, what invariants already hold?
- §R — what did research establish? A spec decision that contradicts §R is a finding.
- Live — for any best-practice claim that is uncertain, fetch it. An out-of-date assumption is a flaw.

A reviewer with no evidence is just an opinion. Earn the authority first.

## Phase 2 — refute

Attack the spec on these axes. For each, try to find the case where it breaks:

- Goal vs reality — does §G solve the actual problem, or a proxy?
- Missing invariant — what can go wrong that no §V catches? (most findings live here)
- Interface drift — does §I match what callers already expect? (cite the caller, file:line)
- Constraint conflict — do two §C bullets contradict? does one fight §R?
- Unowned edge — the input, ordering, failure, or concurrency case no §T covers.
- Altitude — §T too vague to act on, or so granular it is just typing?

## Phase 3 — classify

Each finding: `evidence → claim → severity`.

- BLOCK — build on this spec ships a real defect. Must fix first.
- HARDEN — add/sharpen a §V so the build cannot regress it.
- NOTE — worth knowing, not blocking.

No evidence? Down-rank to NOTE and tag `[unverified]`. ⊥ inflate a hunch to BLOCK.

## Phase 4 — harden §V and gate

- Each HARDEN finding → a draft §V line (testable, cites the §I/behavior it guards). Hand to `cavekit-spec` to write.
- End on an explicit gate using `ask_user_question` only for the GO/NO-GO decision after showing the verdict in normal text:

```text
## review verdict
BLOCK: 1 — §I.api shape ≠ caller src/client.ts:40. fix §I before build.
HARDEN: 2 — drafted V8 (idempotent refund), V9 (tx around dual write).
NOTE: 1 — §T4 vague, split before /ck:build.
gate: NO-GO until BLOCK cleared. then /ck:build §T after cavekit-spec writes V8,V9.
```

GO or NO-GO, never a shrug. Review is the checkpoint that stops a confident wrong build.

## Boundaries

- ⊥ write `SPEC.md`. Draft §V and hand to `cavekit-spec`.
- ⊥ pass a finding with no evidence as fact. Flag `[unverified]`.
- ⊥ review trivia. Right-size or skip.
- ⊥ rewrite the user's intent. Harden the spec, do not replace its goal.
- Reference sibling skills by `cavekit-<verb>` names (e.g. `cavekit-spec`, `cavekit-build`), never upstream `skills/<verb>/SKILL.md` paths.
