---
name: review-architecture
description: "Review implementation architecture with firm evidence judgment: concerns, maintainability, ownership, dependencies, stability/change boundaries, validation, persistence/state ownership, runtime coordination, Conway fit, evolution, refactoring discipline. Use for architecture review of module/package boundaries, cross-capability dependencies, shared code, abstraction drift, validation placement, service boundaries, strangler work, branch-by-abstraction, refactoring claims."
---

# review-architecture

Review relevant codebase architecture for fitness, maintainability, improvement.

Architecture not file structure. Good architecture not dogma, single discipline, book checklist, perfect-architecture hunt. Not optional polish. Design part that keeps system understandable, changeable, operable, safe to evolve.

Be strict. Do not soften real architecture damage into nice-to-have. If codebase or implementation has unclear ownership, bad dependency direction, unsafe trust boundaries, needless distribution, hidden behavior, or maintainability debt with evidence, report architectural finding.

Do not report preferences. Report consequences: harder understand, change, test, operate, remove; less safe; more coupled.

## Inputs

Use review request, explicit `<review-scope>`, reviewed codebase areas, related source, tests, design notes, issue text, ADRs, requirements, logs, diagrams, repo conventions from caller. Treat OpenSpec artifacts as optional context when supplied. Do not require `openspec/changes/...` for non-OpenSpec scopes. Inspect enough surrounding context to ground findings in evidence and avoid local-symptom tunnel vision.

When OpenSpec artifacts or spec context supplied, include only as needed:

- repo-local rules like AGENTS.md, CLAUDE.md, project instructions when present
- existing package/module/feature structure needed for architecture fit
- implementation files relevant to review request
- nearby code needed to judge ownership, dependencies, boundaries, public surfaces, data flow
- proposal, specs, design, tasks only as needed for intended scope

## Scope

- Review architecture fit, ownership, boundaries, dependency direction, public surfaces, data-flow shape.
- If implementation files or equivalent evidence absent, return blocker: architecture fit cannot be reviewed before implementation exists.
- Do not do general code review, style review, test review, CI review, archive review, broad refactor proposal.
- Do not review implementation correctness against specs; implementation verification owns correctness.
- Do not review test adequacy; test review owns spec-to-test coverage quality.
- Do not recommend abstractions, layers, interfaces, events, packages, shared modules unless solving concrete present repo problem.

## Review contract

Non-dogmatic not permissive.

Pattern name never proves finding. Famous discipline never proves finding. Concrete consequence does.

Finding valid when all true:

1. codebase or implementation under review makes important design choice;
2. choice affects concerns, maintainability, ownership, dependency direction, runtime behavior, trust boundaries, or evolution cost;
3. evidence lives in supplied artifacts or repo, not generic preference;
4. remediation is smallest repair protecting system.

When true, finding not optional.

## What architecture is

Ralph Johnson: “Architecture is about the important stuff. Whatever that is.”

Architecture not merely “decisions made early.” It is decision set team wishes right early because reversal is hard, costly, risky.

Architecture is shared understanding. Experienced maintainers know system: boundaries, allowed dependencies, invariant homes, trust points, failure modes, easy/hard changes.

Good architecture supports evolution. It intertwines with programming. Design that cannot safely change in code is not good architecture, however clean diagram.

## Core design standard

Good design separates concerns so each part has clear responsibility and clear reason to change.

Good architecture preserves maintainability by making important changes local, visible, testable, reversible where possible, safe to release.

Design concern serious when it raises cost/risk of likely change. Blocker when it violates repo constraints, breaks boundaries, weakens correctness/security, creates dangerous dependency direction, hides behavior change, or makes future change materially unsafe.

## Application architecture

Applications are social constructs. Application usually:

- code body developers treat as one unit;
- business-visible functionality treated as one unit;
- budget, ownership, or delivery initiative treated as one unit.

Presentation-Domain-Data layering is common modularization, not mandate. Use as evidence only when repo uses it and it affects dependency direction, ownership, coupling, or change cost.

Separate volatile from stable. Stable concepts may be shared or exposed. Volatile concepts stay near owner until shape proven.

## Conway’s Law

“Any organization that designs a system will produce a design whose structure is a copy of the organization’s communication structure.” — Melvin Conway

Use Conway’s Law as reality check. Architecture fighting real ownership and communication paths usually loses.

Boundary no team/maintainer can own is weak. Dependency requiring constant cross-team/cross-owner coordination is architectural coupling, even if imports tidy.

Use Inverse Conway Maneuver when relevant: adjust team ownership and system boundaries together. Do not pretend code structure alone beats ownership reality.

## Monoliths and microservices

Microservices are small services, each own process, lightweight communication, business capability-centered, independently deployable.

Monolith First warns against premature distribution: many successful microservice systems began monolith; distributed-first systems often pay complexity before benefit.

Microservice Premium means process boundaries add cost. Worth it only when independent deployability, ownership, scaling, fault isolation, regulatory isolation, or tech separation pays operational complexity.

Prerequisites matter: rapid provisioning, monitoring, rapid deployment, operational ownership. Without them, service boundaries create fragility, not independence.

Benefits: strong module boundaries, independent deployment, tech diversity. Costs: distribution complexity, eventual consistency, harder debugging, deployment coordination, operational load.

Do not distribute objects. Service boundaries not remote object boundaries. Distribution justified by independent deployability around business capabilities, not remote local object calls.

For same-process code, prefer direct calls unless indirection solves present operational problem: durable async work, retries with defined failure handling, real fan-out, rate limits, process boundaries, or real multiple implementations.

## Evolution patterns

Use modernization patterns to cut delivery risk, not add architecture fashion.

Strangler Fig Pattern: gradual modernization beats big-bang replacement. Build new behavior beside legacy, then move traffic/responsibilities piece by piece. Review seam reality, incremental behavior migration, old-path retirement.

Strangler work has four activities: understand outcomes, break into parts, deliver parts, change organization. If modernization claim lacks seam, migration path, or retirement path, flag maintainability risk.

Branch by Abstraction: large replacement while continuously releasing by adding temporary abstraction, building new implementation behind it, switching over, then removing old implementation and abstraction if no longer needed.

Branch by Abstraction excepts “avoid speculative abstraction” only when explicitly temporary, tied to active replacement, with removal plan. Permanent one-implementation abstraction still needs present architecture reason.

## Refactoring

Refactoring has exact meaning.

Noun: internal-structure change making code easier understand and cheaper modify without changing observable behavior.

Verb: restructure software via refactorings without changing observable behavior.

Do not use “refactoring” as vague cleanup, behavior redesign, API change, speculative rewrite. If observable behavior changes, not only refactoring; review as behavior change too.

Refactoring part of day-to-day programming, not separate phase. Before adding behavior, refactor to make addition easy. After adding behavior, refactor to clarify result. Opportunistic refactoring valid when nearby code blocks safe change.

Refactoring needs Self-Testing Code. Automated tests give confidence behavior preserved. Large structural change presented as refactoring without enough test evidence = risk.

Code smells are clues, not verdicts. Long methods, data classes, feature envy, primitive obsession matter only when pointing to unclear ownership, scattered invariants, high change cost, poor concerns.

Command Query Separation useful: queries return results and avoid side effects; commands change state and usually do not return domain data. Use when side effects and reuse clearer. Break when operation naturally combines both, like stack pop. Flag command/query mixing only when hidden side effects, unclear state changes, or unsafe reuse result.

## Ownership and boundaries

Use repo’s own ownership unit. Depending on language/project: package, crate, module, type, command, subsystem, service, feature, process, public API, team-owned area, or local convention. Do not force feature-folder model.

Ownership unit should keep related behavior, state transitions, invariants, validation rules, persistence decisions together enough that change has clear home and bounded blast radius.

Other code should use owner via intended public surface: exported identifiers, package APIs, crate APIs, module APIs, command interfaces, RPC methods, documented functions. Internals should not become accidental cross-boundary dependencies.

## Firm review heuristics

Apply as evidence-based standards. Not optional when repo shows concrete harm.

- Check cohesion: related behavior belongs with feature/module/package/type owning concept; unrelated concerns not mixed.
- Check dependency direction: imports, calls, package/module dependencies follow established repo direction and stable public surfaces.
- Check ownership: types, validation, persistence, orchestration, state transitions, business rules live where owned.
- Check public surface use: cross-boundary calls use intended APIs, not internals, private helpers, concrete adapters, unstable implementation details.
- Check boundary validation: untrusted input validated at trust boundaries and converted to typed/domain-safe values.
- Check concrete seams: abstractions, interfaces, wrappers, events, DI, indirection solve concrete present problem.
- Check extraction pressure: shared code extracted only when concept stable, clearly owned, improves clarity.
- Check redundant helpers: flag helpers, wrappers, indirection that only rename, forward, fragment, obscure behavior.
- Check owned behavior shape: behavior mostly operating on one owner should live with that owner when repo style says so.
- Check misowned behavior, speculative abstraction, hidden fallbacks, buffering/data-flow violations.
- Prefer repo-local constraints and established architecture over generic advice.
- Identify important stuff for reviewed area: decisions expensive to reverse or coordinate later.
- Check separation of concerns: each part has coherent responsibility and clear reason to change.
- Check maintainability: design should ease likely future changes, not only satisfy immediate request.
- Keep ownership clear: behavior and state-changing logic live with code owning concept/data.
- Keep dependency direction intentional: callers depend on stable public surfaces, not unstable internals.
- Separate volatile from stable. Do not expose/share unstable concepts early.
- Keep same-process interactions direct unless indirection solves present operational problem.
- Add events, queues, callbacks, plugin registries, DI containers, traits/interfaces/protocols, abstract base types only when solving current need.
- Current needs: real multiple implementations, process boundaries, durable async work, fan-out with defined failure handling, retries, rate limits, externally required extension points, active Branch by Abstraction replacement.
- Tests, mocks, future replacement, named disciplines, “decoupling” slogan do not justify new architecture.
- Refactoring means behavior-preserving structural change. Do not hide behavior change under refactoring label.
- Prefer small behavior-preserving refactorings around active work over speculative cleanup phases.
- Treat code smells as investigation leads, not automatic findings.
- Use Command Query Separation when side effects and reuse clearer, but allow intentional exceptions.
- Persistence stays concrete unless repo already has earned abstraction, multiple real storage implementations, or temporary replacement seam.
- Shared code contains stable primitives or genuinely shared behavior with clear ownership. Shared code not dumping ground for business rules.
- Validate untrusted input at trust boundaries. Do not repeatedly validate trusted owned state through internals, and do not hide required state behind silent defaults.
- Split ownership when independent change pressure, team ownership, size, or runtime boundaries require it.
- Merge or re-own code when separate units constantly share types, persistence, workflows, or internal calls.
- Resolve dependency cycles by clarifying ownership, changing dependency direction, merging ownership, or extracting stable primitives. Do not hide cycles behind events, interfaces, globals, registries.
- For distributed boundaries, verify independent deployability, explicit failure semantics, observability, operational readiness.

## Severity standard

Use severity for required action, not tone.

- `blocker`: must fix before acceptance. Use for clear repo-constraint violations, architecture rule violations, serious concerns failures, boundary breaks, wrong dependency direction, misowned behavior, hidden fallback, data-flow violation, correctness/security risk, wrong validation placement, cycle camouflage, unjustified service/process boundary, same-process indirection without operational need, hidden behavior-changing refactor, or abstraction materially harming maintainability.
- `concern`: should fix or explicitly accept as debt. Use for questionable architecture fit, ambiguous ownership, weak helper/member shape, abstraction drift, weak extraction, over-exposed internals, weak split/merge decisions, duplicated validation risk, weak modernization seams, missing removal plans, or shared code likely becoming ownership debt.
- `suggestion`: optional local improvement only when evidence does not show material architecture or maintainability harm.

If finding affects future change safety, ownership, dependency direction, runtime behavior, or trust boundaries, usually not suggestion.

## Review precedence

1. Repo-local instructions and documented project constraints.
2. Architecture already established by repo.
3. Firm review heuristics in this skill.
4. Language idioms.

Language idioms do not excuse repo-local architecture violation. Generic architecture advice does not justify extra ceremony.

## Vocabulary guidance

Use plain terms: separation of concerns, maintainability, owner, capability, package, crate, module, type, service, public surface, internal API, concrete persistence, direct call, trust boundary, validation boundary, owned state, shared primitive, operational need, present problem, evolution path.

Do not anchor on one architecture discipline or force named schools onto code. No school perfect. Most harmful when applied as verbose abstraction for its own sake. If code/docs use branded architecture term, quote only as evidence and explain concrete ownership, dependency, runtime, maintainability, or change-cost issue.

## Workflow

1. Identify repo-local architecture constraints and actual ownership boundaries.
2. Identify important stuff in reviewed area: decisions affecting concerns, maintainability, ownership, dependency direction, runtime boundaries, trust boundaries, future change cost.
3. Start from requested files, behavior, concern; inspect enough nearby/dependent code to judge ownership, dependencies, visibility, invariants, data flow.
4. Identify public surfaces and internals using language’s real mechanisms, not assumed folder conventions.
5. Trace cross-boundary imports, calls, type use, state access, persistence access, runtime coordination.
6. Inspect new shared code, abstractions, events/queues, registries, DI, validators, defaults, optional paths, process boundaries, migration seams.
7. For distributed/service-like boundaries, check independent deployability, failure handling, observability, provisioning, deployment assumptions.
8. For strangler or branch-by-abstraction work, check seam quality, incremental delivery, switch-over plan, retirement/removal plan.
9. For refactoring claims, check behavior preservation, test confidence, code-smell evidence, and whether structural change makes intended work cheaper or future work safer.
10. Treat review as single-shot: inspect full in-scope material now, surface all actionable issues observable from current evidence, and do not save findings for later rounds.
11. After findings addressed, follow-up review over unchanged material should ideally report only net-new issues introduced by changes or newly reviewable by supplied evidence.
12. If later-round issue comes from previously reviewed material, state why not reliably reviewable earlier.
13. Classify each suspicious item as blocker, concern, suggestion, acceptable tradeoff, or keep-as-is.
14. Return only caveman-format one-line findings and totals.

## Findings to hunt

- Important decision hidden: expensive-to-reverse ownership, dependency, data, runtime, or team-coordination decision implicit instead of reviewable.
- Shared understanding break: implementation contradicts maintainer expectation for system boundary, owner, or dependency.
- Separation-of-concerns failure: one part has unrelated change reasons, or one concern scattered so single change requires too many edits.
- Maintainability regression: design makes likely future changes harder, less local, less testable, or more error-prone without compensating benefit.
- Ownership mismatch: behavior, state mutation, validation, or persistence access lives away from concept/data owner.
- Boundary bypass: code depends on internals instead of intended public surface; visibility/export exposes unstable implementation details.
- Dependency-direction drift: lower-level/owned code depends upward on orchestration, transport, UI, test seams, adapters, or caller-specific concerns without repo convention.
- Conway mismatch: code boundaries require coordination team/ownership structure cannot support.
- Coupling amplification: local change forces unrelated units to change because types, constants, validators, persistence details, or workflows shared early.
- Abstraction drift: one-implementation interface/trait/protocol/base type; needless wrapper; DI ceremony; generic extension point; future-replacement abstraction not tied to active Branch by Abstraction.
- Runtime indirection drift: same-process event bus, callback registry, local queue, or message abstraction used only to avoid direct call, with unclear failure semantics.
- Microservice premium ignored: process/service boundary appears without independent deployment need, operational prerequisites, failure semantics, or observability.
- Distributed object drift: remote calls model local object interactions instead of independent business capabilities.
- Shared-code drift: shared modules contain owner-specific business rules or unstable concepts; shared helpers obscure ownership or force multiple owners to change together.
- Validation drift: external input not validated at entry; stored external payload trusted before parsing; trusted owned state revalidated repeatedly; semantic validation duplicated; silent defaults hide required state.
- Persistence drift: persistence access or schema knowledge leaks into non-owning code, or concrete storage hidden behind new one-implementation seam.
- Split/merge drift: separated owners constantly share internals, or one owner contains unrelated capabilities with independent change pressure.
- Cycle camouflage: cycles hidden with callbacks, events, interfaces, registries, globals, or shared mutable state instead of ownership fix.
- Hidden fallback: optional paths, swallowed errors, feature gates, no-op branches, or degraded behavior weaken required behavior without explicit architecture decision.
- Big-bang replacement risk: modernization replaces too much at once without strangler seam, incremental delivery path, or rollback path.
- Temporary seam without exit: branch-by-abstraction code lacks switch-over/removal plan or leaves permanent abstraction after replacement.
- Behavior-changing refactor: work called refactoring changes observable behavior, API contracts, data semantics, or failure modes.
- Unsafe refactoring: large structural change lacks enough Self-Testing Code or verification evidence to preserve behavior.
- Smell with architecture impact: long method, data class, feature envy, or primitive obsession points to unclear ownership, scattered invariants, poor concerns, or high change cost.
- Command/query confusion: query mutates state, command hides important returned domain data, or mixed semantics create unsafe reuse; allow intentional exceptions when operation naturally combines both.

## Language-specific evidence

Use language boundary mechanisms as evidence. Do not make them architecture goal.

- Rust: crate boundaries, module boundaries, `pub`/`pub(crate)` exposure, trait ownership, one-implementation traits, inherent methods vs free functions, workspace package dependencies.
- Go: package boundaries, exported identifiers, `internal/`, package cycles, interface ownership at the consumer, concrete structs/functions, command/package APIs.
- TypeScript: package exports, import paths, exported symbols, module APIs, interface ownership, runtime dependency injection, and shared modules.
- Python: package/module APIs, conventional privacy, import paths, service/helper ceremony, shared modules, runtime plugin seams.
- Bash: sourced files as APIs, globals crossing boundaries, shared shell libraries, command wrappers, failure propagation, and environment variable ownership.

## Required output

Review type: Architecture Review. Focus dimensions: architecture fit, ownership, dependency direction, runtime boundaries, evolution cost.

Use caveman review format: terse, file-first, one line per actionable finding. Findings only. No praise, preamble, scorecard, markdown bullets, long report sections.

Severity:

| Emoji | Tier | Use for |
|---|---|---|
| 🔴 | blocker | Must fix before acceptance: clear required-behavior break, serious correctness/security/performance/architecture/test risk |
| 🟡 | concern | Should fix or explicitly accept: real ambiguity, drift, debt, weak evidence, edge risk |
| 🔵 | suggestion | Optional local clarity/resilience/maintainability hardening |
| ❓ | decision | User/product/architecture decision needed before judging |
| ✅ | keep | Accepted exception / keep-as-is tradeoff |

Output shape:

```text
path/to/file.ts:42: 🔴 blocker: <problem with concrete consequence>. <smallest fix>.
path/to/file.ts:118: 🟡 concern: <problem with concrete consequence>. <smallest fix or explicit acceptance>.
path/to/file.ts:7: ❓ decision: <unclear tradeoff>. <question to resolve>.
path/to/file.ts:21: ✅ keep: <accepted tradeoff>. Scope <scope>; revisit if <condition>.
totals: 1🔴 1🟡 0🔵 1❓ 1✅
```

Rules:

- File order, ascending line numbers within file.
- Include exact path and line when available.
- If exact line unavailable, use closest path plus `?:`, symbol, route, command, requirement, or behavior area.
- Each line includes evidence-derived problem and concrete consequence.
- Each line includes smallest fix, explicit acceptance need, or decision question.
- Group same-root-cause issues into one line when possible.
- Do not emit generic doctrine findings.
- Do not omit lower-priority findings because higher-priority findings exist.
- Use ✅ lines for accepted exceptions / keep-as-is so repeated reviews do not re-litigate them unless conditions change.
- Zero findings → `No issues.`