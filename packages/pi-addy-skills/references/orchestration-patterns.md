# Orchestration Patterns

Reference catalog of agent orchestration patterns this repo endorses, plus anti-patterns to avoid. Read this before adding a new slash command that coordinates multiple personas, or before introducing a new persona that "wraps" existing ones.

The governing rule: **the user (or a slash command) is the orchestrator. Personas do not invoke other personas.** Skills are mandatory hops inside a persona's workflow.

---

## Endorsed patterns

### 1. Direct invocation (no orchestration)

Single persona, single perspective, single artifact. The default and the cheapest option.

```
user → code-reviewer → report → user
```

**Use when:** the work is one perspective on one artifact and you can describe it in one sentence.

**Examples:**
- "Review this PR" → `code-reviewer`
- "Find security issues in `auth.ts`" → `security-auditor`
- "What tests are missing for the checkout flow?" → `test-engineer`

**Cost:** one round trip. The baseline you should always compare orchestrated patterns against.

---

### 2. Single-persona slash command

A slash command that wraps one persona with the project's skills. Saves the user from re-explaining the workflow every time.

```
/review → code-reviewer (with code-review-and-quality skill) → report
```

**Use when:** the same single-persona invocation happens repeatedly with the same setup.

**Examples in this repo:** `/review`, `/test`, `/code-simplify`.

**Cost:** same as direct invocation. The slash command is just a saved prompt.

**Anti-signal:** if the slash command's body is mostly "decide which persona to call," delete it and let the user call the persona directly.

---

### 3. Parallel fan-out with merge

Multiple personas operate on the same input concurrently, each producing an independent report. A merge step (in the main agent's context) synthesizes them into a single decision.

```
                    ┌─→ code-reviewer    ─┐
/ship → fan out  ───┼─→ security-auditor ─┤→ merge → go/no-go + rollback
                    └─→ test-engineer    ─┘
```

**Use when:**
- The sub-tasks are genuinely independent (no shared mutable state, no ordering dependency)
- Each sub-agent benefits from its own context window
- The merge step is small enough to stay in the main context
- Wall-clock latency matters

**Examples in this repo:** `/ship`.

**Cost:** N parallel sub-agent contexts + one merge turn. Higher than direct invocation, but faster wall-clock and produces better reports because each sub-agent stays focused on its single perspective.

**Validation checklist before adopting this pattern:**
- [ ] Can I run all sub-agents at the same time without ordering issues?
- [ ] Does each persona produce a different *kind* of finding, not just the same finding from a different angle?
- [ ] Will the merge step fit in the main agent's remaining context?
- [ ] Is the user's wait time long enough that parallelism is actually noticeable?

If any answer is "no," fall back to direct invocation or a single-persona command.

---

### 4. Sequential pipeline as user-driven slash commands

The user runs slash commands in a defined order, carrying context (or commit history) between them. There is no orchestrator agent — the user IS the orchestrator.

```
user runs:  /spec  →  /plan  →  /build  →  /test  →  /review  →  /ship
```

**Use when:** the workflow has dependencies (each step needs the previous step's output) and human judgment between steps adds value.

**Examples in this repo:** the entire DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP lifecycle.

**Cost:** one sub-agent context per step. Free for the orchestration layer because there is no orchestrator agent.

**Why not automate it:** an LLM "lifecycle orchestrator" would (a) lose nuance between steps because it has to summarize for hand-off, (b) skip the human checkpoints that catch wrong-direction work early, and (c) double the token cost via paraphrasing turns.

---

### 5. Research isolation (context preservation)

When a task requires reading large amounts of material that shouldn't pollute the main context, spawn a research sub-agent that returns only a digest.

```
main agent → research sub-agent (reads 50 files) → digest → main agent continues
```

**Use when:**
- The main session needs to stay focused on a downstream task
- The investigation result is much smaller than the input it consumes
- The decision quality benefits from the main agent having room to think after

**Examples:** "Find every call site of this deprecated API across the monorepo," "Summarize what these 30 ADRs say about caching."

**Cost:** one isolated sub-agent context. Worth it any time the alternative is loading hundreds of files into the main context.

**On omp, use the built-in `scout` agent** (`task` with `agent: "scout"`) rather than defining a custom research persona; on pi, use a research role through the `subagent` tool. Both are read-only and purpose-built for this pattern. Define a custom research subagent only when the built-ins don't fit (e.g. you need a domain-specific system prompt the model wouldn't infer).

---

## Host compatibility (pi and omp)

This catalog is harness-agnostic. This port ships it on pi and omp. Here's how each pattern maps onto their primitives — and where the platforms enforce our rules for us.

### Where personas live

Personas live in `agents/` at the package root. omp discovers them natively as `task` tool agents from any enabled extension package. On pi, the bundled extension publishes the same directory as a pi-herdr-agents role pack (`pi-herdr-subagents:roles:discover:v1`), so `subagent({ agent: "code-reviewer", ... })` resolves there. No path configuration is needed on either host.

### Fan-out primitives

| | omp | pi (pi-herdr-agents) |
|--|-----|----------------------|
| Spawn | `task` tool | `subagent` tool |
| Parallel dispatch | one `task` call with all items in `tasks[]` | multiple `subagent` calls in a single assistant turn |
| Messaging live peers | `write agent://<id>` (or `agent://all` to broadcast) | parent relays; children signal via `caller_ping` |
| Inspecting a live peer | `proc://<id>`, `agent://<id>` | herdr session views |

**The personas in this package work on both.** Spawned by `as:ship`, they report findings to the main session. For an adversarial investigation (worked example below), omp's agent messaging lets live agents challenge each other directly.

### Platform-enforced rules

Two rules in this catalog aren't just convention — both hosts enforce them:

- **Subagents do not spawn further subagents by default** (omp: task agents hold no `task` tool unless declared; pi-herdr: `spawning: false` denies the spawning tools). Anti-pattern B (persona-calls-persona) and Anti-pattern D (deep persona trees) fail by construction.
- **Sequential turns serialize.** Parallelism exists only inside one batched dispatch — which is why `as:ship` asks for a single `tasks[]` call on omp, or all `subagent` calls in one turn on pi.

### Built-in agents to know about

Before defining a custom persona, check whether a host built-in covers the role:

| Built-in (omp) | Purpose |
|----------------|---------|
| `scout` | Read-only codebase exploration and pattern search. Use for Pattern 5 (research isolation). |
| `reviewer` | General code-quality review of a diff or file. |
| `security-reviewer` | Read-only, evidence-backed security review. |
| `task` | General-purpose multi-step delegate. |

Don't redefine these. Layer the specialist personas (code-reviewer, security-auditor, test-engineer, web-performance-auditor) on top of them.

### Persona frontmatter

Persona files carry the superset of fields both hosts read: `name` and `description` (both hosts), plus `system-prompt: append`, `spawning: false`, and `auto-exit: true` (pi-herdr role pack). omp additionally accepts `tools`, `spawns`, `model`, `thinkingLevel`, and `autoloadSkills`; each host ignores the fields it does not know.

**Model selection uses roles, never vendor model names.** omp resolves role aliases like `@slow`, `@judge`, `@smol`, and `@default` through the user's model configuration; pi-herdr routes models through its `models.agents` config. The personas in this package omit `model` entirely and inherit the session model.

### Worked example: competing-hypothesis debugging

The `as:ship` fan-out produces three independent reports on a known artifact. Some problems instead need investigators that challenge each other — for example an intermittent hang with several plausible causes (a race condition, a slow auth fall-through, a missing index, a silently retrying third-party API). A single agent picks the first plausible theory and stops; independent reports never meet, so nothing rules out the wrong theories.

On omp, run this as one `task` call with the three personas (`code-reviewer` on races and blocking calls, `security-auditor` on auth and session handling, `test-engineer` on distinguishing tests and coverage gaps), then drive the adversarial loop from the main session: relay each agent's findings to the others with `write agent://<id>`, or broadcast with `agent://all`, and converge only when two agents agree they can disprove the others'. On pi, the same shape runs through the parent relaying reports between `subagent` runs. When no live-messaging loop is available, fall back to the main session relaying findings verbatim — never paraphrased (Anti-pattern C).

Reach for this only when the agents **need** to challenge each other to produce the right answer; it costs noticeably more than a fan-out. For a production-bound verdict on a known diff use `as:ship`; for one specialist lens use direct persona invocation; for sequential lifecycles use the prompt chain (Pattern 4); for read-heavy research use `scout` (omp) or a research role (pi).

---

## Anti-patterns

### A. Router persona ("meta-orchestrator")

A persona whose job is to decide which other persona to call.

```
/work → router-persona → "this needs a review" → code-reviewer → router (paraphrases) → user
```

**Why it fails:**
- Pure routing layer with no domain value
- Adds two paraphrasing hops → information loss + roughly 2× token cost
- The user already knew they wanted a review; they could have called `/review` directly
- Replicates the work that slash commands and intent mapping in `AGENTS.md` already do

**What to do instead:** add or refine slash commands. Document intent → command mapping in `AGENTS.md`.

---

### B. Persona that calls another persona

A `code-reviewer` that internally invokes `security-auditor` when it sees auth code.

**Why it fails:**
- Personas were designed to produce a single perspective; chaining them defeats that
- The summary the calling persona passes loses context the called persona needs
- Failure modes multiply (which persona's output format wins? whose rules apply?)
- Hides cost from the user

**What to do instead:** have the calling persona *recommend* a follow-up audit in its report. The user or a slash command runs the second pass.

---

### C. Sequential orchestrator that paraphrases

An agent that calls `/spec`, then `/plan`, then `/build`, etc. on the user's behalf.

**Why it fails:**
- Loses the human checkpoints that catch wrong-direction work
- Each hand-off summarizes context — accumulated drift over a long pipeline
- Doubles token cost: orchestrator turn + sub-agent turn for every step
- Removes user agency at exactly the points where judgment matters most

**What to do instead:** keep the user as the orchestrator. Document the recommended sequence in `README.md` and let users invoke it.

---

### D. Deep persona trees

`/ship` calls a `pre-ship-coordinator` that calls a `quality-coordinator` that calls `code-reviewer`.

**Why it fails:**
- Each layer adds latency and tokens with no decision value
- Debugging becomes a multi-level investigation
- The leaf personas lose context to multiple summarization steps

**What to do instead:** keep the orchestration depth at most 1 (slash command → personas). The merge happens in the main agent.

---

## Decision flow

When considering a new orchestrated workflow, walk this flow:

```
Is the work one perspective on one artifact?
├── Yes → Direct invocation. Stop.
└── No  → Will the same composition repeat?
         ├── No  → Direct invocation, ad hoc. Stop.
         └── Yes → Are sub-tasks independent?
                  ├── No  → Sequential slash commands run by user (Pattern 4).
                  └── Yes → Parallel fan-out with merge (Pattern 3).
                           Validate against the checklist above.
                           If any check fails → fall back to single-persona command (Pattern 2).
```

---

## When to add a new pattern to this catalog

Add a new entry only after:

1. You've used the pattern at least twice in real work
2. You can name a concrete artifact in this repo that demonstrates it
3. You can explain why an existing pattern wouldn't have worked
4. You can describe its anti-pattern shadow (what people will mistakenly build instead)

Premature catalog entries become aspirational documentation that no one follows.
