---
name: cavekit-deepen
description: Optional design-improvement pass for spare usage budget. Finds the shallowest module the spec touches, researches a deeper design, and proposes refactors that shrink interfaces and hide decisions — behavior held constant, tests green before and after. Proposes §I/§V/§T edits, never silent rewrites. Use when users invoke /ck:deepen, say "deepen this", "improve the design", "this module feels shallow", or "use spare budget on the codebase".
---

# cavekit-deepen — make modules deep

Behavior is sacred: tests green before AND after. Every change shrinks an interface or hides a decision — deepen, don't churn. Defers all `SPEC.md` writes to `cavekit-spec`.

Read bundled `../../FORMAT.md` before drafting §I/§V/§T handoff content.

A deep module hides a lot behind a small interface; a shallow one's interface costs as much to use as writing the code yourself. Complexity = dependencies + obscurity, and it compounds. Deepen spends spare usage paying that down before it becomes a §B. Run it when the build is green and there is budget to drain — not under deadline.

## When to deepen

- Build is green, tests pass, and token budget spare exists.
- A module's interface feels as complex as its implementation (shallow smell).
- The same change keeps touching many files (change amplification).
- User explicitly asks to improve design quality.

⊥ run mid-feature or under pressure. Deepen is the deliberate pass, not the reflex.

## Five steps

### 1. Pick the shallow

Scan the modules the spec touches. Rank by shallowness — interface surface vs work done. Pick the one worst offender. Tells:

- Pass-through method that only forwards to one other (shallow layer).
- Caller must set 5 flags right to use it (config leakage).
- Same abstraction repeated at two layers (no information hiding).
- A `?` or §B that traces back to a confusing interface.

One module per pass. Deepening is surgical, ⊥ a codebase sweep. If `cavecrew-investigator` is available, use it for read-only shallowness ranking; it must not design or edit.

### 2. Diagnose

Name the design defect in caveman, citing file:line:

> src/auth/token.go: 6-arg ctor leaks rotation policy to every caller. shallow.

Complexity is real only if it shows: change amplification, high cognitive load, or an unknown-unknown (caller must know a hidden fact to call it right).

### 3. Research the deepening

What does a deeper version look like? Pull a known pattern (hand to `cavekit-research` for the external case → §R) or derive from the codebase's own better modules. Moves that deepen:

- Pull complexity down — hide the hard part inside, give callers the simple path.
- Define errors out of existence — design the interface so the edge cannot occur.
- Information hiding — one decision, one module; callers don't learn it.
- General-purpose interface over a pile of special-case methods.

### 4. Propose

Draft the change as spec edits, not a silent rewrite:

- New/simpler §I shape for the module.
- §V that locks the deepened invariant so a future build cannot re-shallow it.
- §T refactor row(s), each citing the §V/§I it serves.

Hand to `cavekit-spec` to write. Show the before/after interface so the user sees the shrink.

### 5. Verify behavior held

Refuse to rewrite. Full suite green before starting AND after. A deepening that changes behavior is a feature in disguise — stop, route through `/ck:spec` + `/ck:build`. New interface gets a test proving the old callers still work.

## When to stop

Done when the chosen module's interface is strictly smaller, its hidden decision no longer leaks, tests are green, and §I/§V record the new shape. One module deepened beats five churned. Budget left → pick the next shallowst, fresh pass.

## Boundaries

- ⊥ change behavior. Green before, green after. Pure structure.
- ⊥ write `SPEC.md`. Propose §I/§V/§T; `cavekit-spec` writes.
- ⊥ deepen more than one module per pass.
- ⊥ run under deadline or mid-feature. This is the spare-budget pass.
- ⊥ add abstraction for single-use code. A deep module earns its hiding; a speculative one is just more surface.
- Reference sibling skills by `cavekit-<verb>` names (e.g. `cavekit-spec`, `cavekit-research`), never upstream `skills/<verb>/SKILL.md` paths.
