---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and routes project-root SPEC.md amendments through cavekit-spec as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
allowed-tools: read edit write bash ask_user_question subagent codebase_memory_search_graph codebase_memory_search_code codebase_memory_get_code_snippet codebase_memory_trace_path codebase_memory_get_architecture codebase_memory_query_graph
---

<what-to-do>

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

When Pi has the `ask_user_question` tool available, use it for every grilling question instead of plain chat questions. Ask one focused question per tool call with 2-4 concrete options. Put your recommended answer first and mark it `(Recommended)`. Let the user type a custom answer or choose chat when none fit.

If a question can be answered by exploring the codebase, explore the codebase instead.

Prefer codebase-memory tools for codebase research when available. Start broad with `codebase_memory_get_architecture`, then use `codebase_memory_search_graph` or `codebase_memory_search_code` for anchors, `codebase_memory_trace_path` for callers/callees/data-flow impact, and `codebase_memory_get_code_snippet` for exact symbol source. Use exact file reads only for docs, configs, non-code files, or follow-up context after graph narrowing. If codebase-memory is unavailable or stale, say discovery is degraded before falling back to direct reads/search.

When `subagent` is available and codebase fact-finding would otherwise consume lots of context, soft-delegate lookup to `cavecrew-investigator`: first call `subagent` with `{ "action": "list" }`, confirm `cavecrew-investigator` is executable/non-disabled, then run it with a read-only locator task. Use its file:line facts only; keep grilling decisions and documentation writes in main thread. If missing/unavailable, fall back to codebase-memory/direct reads without failing.

</what-to-do>

<supporting-info>

## Domain awareness

During codebase exploration, also look for existing documentation:

### File structure

`SPEC.md` is always the canonical project document:

```
/
├── SPEC.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

Create files lazily — only when you have something to write. If no `SPEC.md` exists or a resolved term/decision requires a `SPEC.md` change, invoke/use `cavekit-spec`; grill-with-docs must not edit `SPEC.md` directly. If no `docs/adr/` exists, create it when the first ADR is needed.

Existing `CONTEXT.md` or `CONTEXT-MAP.md` files are read-only legacy input. Propose relevant term imports as `cavekit-spec` amendments, then ignore them. Never create or update `CONTEXT.md` or `CONTEXT-MAP.md`.

## During the session

### Challenge against SPEC language

When the user uses a term that conflicts with existing language in `SPEC.md`, call it out immediately. "SPEC defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Route SPEC.md changes through cavekit-spec

When a term or decision is resolved, immediately route the project-root `SPEC.md` change through `cavekit-spec`. Don't batch these up — capture them as they happen. Grill-with-docs may draft exact amendments, but must not directly edit `SPEC.md`. Use the routing guide in [SPEC-FORMAT.md](./SPEC-FORMAT.md).

Use Cavekit-compatible sections: resolved domain terms and boundaries go in `§C CONSTRAINTS`; external surfaces go in `§I INTERFACES`; testable rules go in `§V INVARIANTS`; follow-up work goes in `§T TASKS`. Do not add a separate glossary section.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md). ADRs may explain rationale, but `SPEC.md` remains the source of truth; route any matching `SPEC.md` amendment through `cavekit-spec` too.

</supporting-info>
