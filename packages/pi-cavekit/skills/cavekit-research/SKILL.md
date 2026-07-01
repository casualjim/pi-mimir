---
name: cavekit-research
description: Gather external knowledge the spec needs and distill it into §R — the durable research log — so build grounds in facts instead of hallucinating library behavior. Each finding cites a source; unsourced claims are flagged, never written as fact. Use when users invoke /ck:research, a spec decision hinges on a lib/API/best practice, or they say "research this", "what's the best lib for…". Defers the §R write to cavekit-spec.
---

# cavekit-research — external knowledge → §R

Every finding cites a source. No source → flag it `?`, never write a guess as fact. Defers all `SPEC.md` writes to `cavekit-spec`.

Read bundled `../../FORMAT.md` before drafting §R rows (section `id|topic|finding|src`).

## When to research

- A §C/§I/§V decision hinges on a lib, API, version, or pattern that is uncertain.
- About to assume how an external dependency behaves.
- The idea touches a domain with real prior art (auth, payments, crypto, rate-limit).
- `/ck:grill` parked a `?` that the outside world must answer.

Skip when the build touches only code already in the repo. Research scales to the unknown, ⊥ to habit.

## Four steps

### 1. Scope

Turn the unknown into 1-3 concrete questions. Vague "research auth" → "JWT lib for Node ESM, maintained?" + "refresh-token rotation: current best practice?". A scoped question gets a citable answer; a vague one gets an essay.

### 2. Gather

Use web search / docs tools. Prefer primary sources: official docs, the repo, the RFC, the paper. Two independent sources beat one confident blog. For a big sweep, delegate read-only gathering to `cavecrew-investigator` when available so raw pages never touch this context; it returns only the distilled finding + source. If unavailable, use web tools directly.

### 3. Distill

Crush each answer to one caveman line + its source. Drop the prose. The §R row is the memory; the tab read is not.

> R3|refresh token|rotate on use, revoke family on reuse-detect|datatracker.ietf.org/doc/html/rfc6819#section-5.2.2.3

### 4. Hand off

Emit the §R rows and hand to `cavekit-spec` to append. If a finding changes a constraint or interface, note the §C/§I edit for `cavekit-spec` too. `cavekit-research` proposes; `cavekit-spec` writes.

## Source discipline

- Cite a URL, repo, RFC, or paper per row. Verbatim identifiers and versions.
- Could not verify → write the row but flag `?` in the finding and say so. An unverified claim labeled honestly is fine; one disguised as fact is a future §B.
- Conflicting sources → log both, let the user pick. ⊥ silently average them.

## When to stop

Done when every scoped question has a sourced §R row (or an honest `?`), and no build decision still rests on an unchecked assumption. ⊥ research past the scoped questions — that burns the attention budget.

## Boundaries

- ⊥ write `SPEC.md`. Hand §R rows to `cavekit-spec`.
- ⊥ write a finding as fact without a source.
- ⊥ dump raw pages into context or §R. Distill or it does not land.
- ⊥ research what can be read in the repo. Local truth > web guess.
- Reference sibling skills by `cavekit-<verb>` names (e.g. `cavekit-spec`), never upstream `skills/<verb>/SKILL.md` paths.
