---
name: review-architecture
description: "Reviews implementation architecture with firm, evidence-based judgment: separation of concerns, maintainability, ownership, dependency direction, stability/change boundaries, validation, persistence/state ownership, runtime coordination, Conway fit, evolution strategy, and refactoring discipline. Use when asked for architecture review of module/package boundaries, cross-capability dependencies, shared code, abstraction drift, validation placement, service boundaries, strangler work, branch-by-abstraction changes, or refactoring claims."
---

# review-architecture

Review the relevant codebase architecture for fitness, maintainability, and improvement opportunities.

Architecture is not file structure. Good architecture is not dogma, not one discipline, not a checklist copied from a book, and not a search for perfect architecture. It is also not optional polish. It is the part of design that determines whether the system stays understandable, changeable, operable, and safe to evolve.

Be strict. Do not downgrade real architecture damage into a nice-to-have. If the codebase or implementation under review has unclear ownership, bad dependency direction, unsafe trust boundaries, needless distribution, hidden behavior, or maintainability debt with concrete evidence, report it as an architectural finding.

Do not report preferences. Report consequences: what becomes harder to understand, harder to change, harder to test, harder to operate, less safe, more coupled, or harder to remove.

## Inputs

Use the review request, codebase areas under review, related source, tests, design notes, issue text, ADRs, requirements, logs, diagrams, and repository conventions supplied by the caller. Inspect enough surrounding context to ground findings in evidence and avoid treating local symptoms as isolated problems.

For spec-driven implementation reviews, include:

- repository-local rules such as AGENTS.md, CLAUDE.md, or project instructions when present
- existing package/module/feature structure needed to understand architecture fit
- implementation files relevant to the review request
- nearby code needed to judge ownership, dependencies, boundaries, public surfaces, and data flow
- proposal, specs, design, and tasks only as needed to understand intended scope

## Scope

- Review architecture fit, ownership, boundaries, dependency direction, public surfaces, and data-flow shape.
- If implementation files or equivalent implementation evidence are not present, return a blocker stating that architecture fit cannot be reviewed before implementation exists.
- Do not perform a general code review, style review, test review, CI review, archive review, or broad refactor proposal.
- Do not review implementation correctness against specs; implementation verification owns correctness.
- Do not review test adequacy; test review owns spec-to-test coverage quality.
- Do not recommend abstractions, layers, interfaces, events, packages, or shared modules unless they solve a concrete present problem in this repository.

## Review contract

Non-dogmatic does not mean permissive.

A pattern name never proves a finding. A famous discipline never proves a finding. A concrete consequence does.

A finding is valid when it shows all of these:

1. the codebase or implementation under review makes an important design choice;
2. the choice affects separation of concerns, maintainability, ownership, dependency direction, runtime behavior, trust boundaries, or evolution cost;
3. the evidence is in the supplied artifacts or repository, not in generic preference;
4. the remediation is the smallest repair that protects the system.

When those conditions are met, the finding is not optional.

## What architecture is

Ralph Johnson: “Architecture is about the important stuff. Whatever that is.”

Architecture is not simply “decisions made early.” It is the set of decisions the team wishes it could get right early because they are hard, costly, or risky to reverse later.

Architecture is shared understanding. It is what experienced maintainers know about the system: where important boundaries are, which dependencies are allowed, where invariants live, where data becomes trusted, which failure modes matter, and which changes should be easy or hard.

Good architecture supports its own evolution. It is intertwined with programming. A design that cannot be safely changed in code is not good architecture, no matter how clean the diagram looks.

## Core design standard

Good design separates concerns so each part has a clear responsibility and a clear reason to change.

Good architecture preserves maintainability by making important changes local, visible, testable, reversible where possible, and safe to release.

A design concern is serious when it increases the cost or risk of likely change. It is a blocker when it violates repository constraints, breaks established boundaries, weakens correctness/security, creates dangerous dependency direction, hides behavior change, or makes future change materially unsafe.

## Application architecture

Applications are social constructions. An application is usually:

- a body of code developers treat as one unit;
- functionality the business sees as one unit;
- a budget, ownership, or delivery initiative treated as one unit.

Presentation-Domain-Data layering is a common modularization, not a mandate. Use it as evidence only when the repository actually uses it and when it affects dependency direction, ownership, coupling, or change cost.

Separate what changes from what stays stable. Stable concepts can be shared or exposed. Volatile concepts should stay close to their owner until their shape is proven.

## Conway’s Law

“Any organization that designs a system will produce a design whose structure is a copy of the organization’s communication structure.” — Melvin Conway

Use Conway’s Law as a reality check. Architecture that fights real ownership and communication paths usually loses.

A boundary that no team or maintainer can own is weak. A dependency that requires constant cross-team or cross-owner coordination is architectural coupling, even if the imports look tidy.

Use the Inverse Conway Maneuver when relevant: adjust team ownership and system boundaries together. Do not pretend code structure alone can overcome ownership reality.

## Monoliths and microservices

Microservices are small services, each in its own process, communicating through lightweight mechanisms, built around business capabilities, and independently deployable.

Monolith First is a warning against premature distribution: many successful microservice systems started as monoliths, while systems that start distributed often pay complexity before earning the benefit.

Microservice Premium means process boundaries add cost. They are worthwhile only when independent deployability, ownership, scaling, fault isolation, regulatory isolation, or technology separation pays for the operational complexity.

Prerequisites matter: rapid provisioning, monitoring, rapid deployment, and operational ownership are part of the architecture. Without them, service boundaries often create fragility instead of independence.

Benefits can include strong module boundaries, independent deployment, and technology diversity. Costs include distribution complexity, eventual consistency, harder debugging, deployment coordination, and operational load.

Do not distribute objects. Service boundaries should not be remote object boundaries. Distribution is justified by independent deployability around business capabilities, not by making local object calls remote.

For same-process code, prefer direct calls unless indirection solves a present operational problem such as durable async work, retries with defined failure handling, real fan-out, rate limits, process boundaries, or actual multiple implementations.

## Evolution patterns

Use modernization patterns to reduce delivery risk, not to add architecture fashion.

Strangler Fig Pattern: gradual modernization beats big-bang replacement. New behavior can be built alongside legacy behavior, then traffic or responsibilities move over piece by piece. Review whether the seam is real, behavior migration is incremental, and old paths can be retired.

Strangler work has four activities: understand outcomes, break into parts, deliver parts, and change the organization. If a change claims modernization but lacks a seam, migration path, or retirement path, flag the maintainability risk.

Branch by Abstraction: large-scale replacement can be done while releasing continuously by introducing a temporary abstraction, building the new implementation behind it, switching over, and then removing the old implementation and the abstraction if it is no longer needed.

Branch by Abstraction is an exception to “avoid speculative abstraction” only when it is explicitly temporary, tied to active replacement work, and has a removal plan. A permanent one-implementation abstraction still needs a present architectural reason.

## Refactoring

Refactoring has a precise meaning.

Noun: a change to internal structure that makes code easier to understand and cheaper to modify without changing observable behavior.

Verb: to restructure software by applying a series of refactorings without changing observable behavior.

Do not treat “refactoring” as a vague synonym for cleaning up code, redesigning behavior, changing APIs, or doing speculative rewrites. If observable behavior changes, it is not only a refactoring and must be reviewed as behavior change too.

Refactoring is part of day-to-day programming, not a separate phase. Before adding behavior, code can be refactored to make the addition easy. After adding behavior, code can be refactored to clarify the result. Opportunistic refactoring is valid when nearby code blocks safe change.

Refactoring needs Self-Testing Code. Automated tests provide confidence that behavior was preserved. When a large structural change is presented as refactoring without enough test evidence, flag the risk.

Code smells are clues, not verdicts. Long methods, data classes, feature envy, and primitive obsession are worth investigating only when they point to unclear ownership, scattered invariants, high change cost, or poor separation of concerns.

Command Query Separation is useful: queries return results and avoid side effects; commands change state and usually do not return domain data. Use it when it makes side effects and reuse clearer. Break it when the operation naturally combines both, such as stack pop. Flag command/query mixing only when it creates hidden side effects, unclear state changes, or unsafe reuse.

## Ownership and boundaries

Use the repository’s own unit of ownership. Depending on language and project, that may be a package, crate, module, type, command, subsystem, service, feature, process, public API, team-owned area, or other local convention. Do not force repositories into a feature-folder model.

A unit of ownership should keep related behavior, state transitions, invariants, validation rules, and persistence decisions together enough that a change has a clear home and a bounded blast radius.

Other code should use the owner through the owner’s intended public surface. The public surface may be exported identifiers, package APIs, crate APIs, module APIs, command interfaces, RPC methods, or documented functions. Internals should not become cross-boundary dependencies by accident.

## Firm review heuristics

Apply these as evidence-based standards. They are not optional when the repository shows concrete harm.

- Check cohesion: related behavior should belong with the feature, module, package, or type that owns the concept; unrelated concerns should not be mixed.
- Check dependency direction: imports, calls, and package/module dependencies should follow the repository's established direction and use stable public surfaces.
- Check ownership: types, validation, persistence, orchestration, state transitions, and business rules should live at the layer or feature that owns them.
- Check public surface use: cross-boundary calls should use intended APIs, not internals, private helpers, concrete adapters, or unstable implementation details.
- Check boundary validation: untrusted input should be validated at trust boundaries and converted to typed or domain-safe values.
- Check concrete seams: abstractions, interfaces, wrappers, events, dependency injection, or indirection should solve a concrete present problem.
- Check extraction pressure: shared code should be extracted only when the concept is stable, clearly owned, and improves clarity.
- Check redundant helpers: flag helpers, wrappers, and indirection that only rename, forward, fragment, or obscure behavior.
- Check owned behavior shape: behavior that mostly operates on one existing owner should live with that owner when that is the repository's established style.
- Check misowned behavior, speculative abstraction, hidden fallbacks, and buffering/data-flow violations.
- Prefer repository-local constraints and established architecture over generic advice.
- Identify the important stuff for the reviewed system area: decisions expensive to reverse or coordinate later.
- Check separation of concerns: each part should have a coherent responsibility and a clear reason to change.
- Check maintainability: the design should make likely future changes easier, not just satisfy the immediate request.
- Keep ownership clear: behavior and state-changing logic should live with the code that owns the concept or data.
- Keep dependency direction intentional: callers should depend on stable public surfaces, not unstable internals.
- Separate volatile code from stable code. Do not expose or share unstable concepts prematurely.
- Keep same-process interactions direct unless indirection solves a present operational problem.
- Add events, queues, callbacks, plugin registries, dependency injection containers, traits/interfaces/protocols, or abstract base types only when they solve a current need.
- Current needs include real multiple implementations, process boundaries, durable async work, fan-out with defined failure handling, retries, rate limits, externally required extension points, or active Branch by Abstraction replacement work.
- Tests, mocks, future replacement, named disciplines, and “decoupling” as a slogan do not justify new architecture.
- Refactoring means behavior-preserving structural change. Do not hide behavior change inside a refactoring label.
- Prefer small, behavior-preserving refactorings around active work over speculative cleanup phases.
- Treat code smells as investigation leads, not automatic findings.
- Use Command Query Separation when it makes side effects and reuse clearer, but allow intentional exceptions.
- Persistence should stay concrete unless the repository already has an earned abstraction, multiple real storage implementations, or a temporary replacement seam.
- Shared code should contain stable primitives or genuinely shared behavior with clear ownership. Shared code should not become a dumping ground for business rules.
- Validate untrusted input at trust boundaries. Do not repeatedly validate trusted owned state through internal layers, and do not hide required state behind silent defaults.
- Split ownership when independent change pressure, team ownership, size, or runtime boundaries require it.
- Merge or re-own code when separate units constantly share types, persistence, workflows, or internal calls.
- Resolve dependency cycles by clarifying ownership, changing dependency direction, merging ownership, or extracting stable primitives. Do not hide cycles behind events, interfaces, globals, or registries.
- For distributed boundaries, verify independent deployability, explicit failure semantics, observability, and operational readiness.

## Severity standard

Use severity to express required action, not tone.

- `blocker`: must fix before acceptance. Use for clear repository-constraint violations, architecture rule violations, serious separation-of-concerns failures, boundary breaks, wrong dependency direction, misowned behavior, hidden fallback, data-flow violation, correctness/security risk, wrong validation placement, cycle camouflage, unjustified service/process boundary, same-process indirection without operational need, hidden behavior-changing refactor, or abstraction that materially harms maintainability.
- `concern`: should fix or explicitly accept as debt. Use for questionable architecture fit, ambiguous ownership, weak helper/member shape, abstraction drift, weak extraction, over-exposed internals, weak split/merge decisions, duplicated validation risk, weak modernization seams, missing removal plans, or shared code likely to become ownership debt.
- `suggestion`: optional local improvement only when the evidence does not show material architecture or maintainability harm.

If the finding affects future change safety, ownership, dependency direction, runtime behavior, or trust boundaries, it is usually not a suggestion.

## Review precedence

1. Repository-local instructions and documented project constraints.
2. The architecture already established by the repository.
3. The firm review heuristics in this skill.
4. Language-specific idioms.

Language idioms do not excuse violating repository-local architecture. Generic architecture advice does not justify extra ceremony.

## Vocabulary guidance

Use plain terms: separation of concerns, maintainability, owner, capability, package, crate, module, type, service, public surface, internal API, concrete persistence, direct call, trust boundary, validation boundary, owned state, shared primitive, operational need, present problem, evolution path.

Do not anchor on one architecture discipline or force named architecture schools onto the code. No school is perfect. Most become harmful when applied as verbose abstraction for its own sake. If code or docs use a branded architecture term, quote it only as evidence and explain the concrete ownership, dependency, runtime, maintainability, or change-cost issue.

## Workflow

1. Identify repository-local architecture constraints and the repository’s actual ownership boundaries.
2. Identify the important stuff in the reviewed system area: decisions that affect separation of concerns, maintainability, ownership, dependency direction, runtime boundaries, trust boundaries, or future change cost.
3. Start from the requested files, behavior, or concern, then inspect enough nearby and dependent code to judge ownership, dependencies, visibility, invariants, and data flow.
4. Identify public surfaces and internals using the language’s real mechanisms, not assumed folder conventions.
5. Trace cross-boundary imports, calls, type use, state access, persistence access, and runtime coordination.
6. Inspect new shared code, abstractions, events/queues, registries, dependency injection, validators, defaults, optional paths, process boundaries, and migration seams.
7. For distributed or service-like boundaries, check independent deployability, failure handling, observability, provisioning, and deployment assumptions.
8. For strangler or branch-by-abstraction work, check seam quality, incremental delivery, switch-over plan, and retirement/removal plan.
9. For refactoring claims, check behavior preservation, test confidence, code-smell evidence, and whether the structural change makes intended work cheaper or future work safer.
10. Classify each suspicious item as a blocker, concern, suggestion, acceptable tradeoff, or keep-as-is.
11. Return only numbered findings and the required review sections.

## Findings to hunt

- Important decision hidden: an expensive-to-reverse ownership, dependency, data, runtime, or team-coordination decision is implicit instead of reviewable.
- Shared understanding break: the implementation contradicts how experienced maintainers would expect the system boundary, owner, or dependency to work.
- Separation-of-concerns failure: one part now has multiple unrelated reasons to change, or one concern is scattered so a single change requires edits in too many places.
- Maintainability regression: the design makes likely future changes harder, less local, less testable, or more error-prone without a compensating benefit.
- Ownership mismatch: behavior, state mutation, validation, or persistence access lives away from the code that owns the concept or data.
- Boundary bypass: code depends on internals instead of the intended public surface; visibility/export choices expose unstable implementation details.
- Dependency-direction drift: lower-level or owned code depends upward on orchestration, transport, UI, test seams, adapters, or caller-specific concerns without an existing repository convention.
- Conway mismatch: code boundaries require coordination that the team or ownership structure cannot realistically support.
- Coupling amplification: a local change forces unrelated units to change because types, constants, validators, persistence details, or workflows were shared prematurely.
- Abstraction drift: one-implementation interface/trait/protocol/base type; needless wrapper; dependency injection ceremony; generic extension point; abstraction justified by future replacement but not tied to active Branch by Abstraction work.
- Runtime indirection drift: same-process event bus, callback registry, local queue, or message abstraction used only to avoid a direct call, with unclear failure semantics.
- Microservice premium ignored: a process/service boundary appears without independent deployment need, operational prerequisites, failure semantics, or observability.
- Distributed object drift: remote calls model local object interactions instead of independent business capabilities.
- Shared-code drift: shared modules contain owner-specific business rules or unstable concepts; shared helpers obscure ownership or force multiple owners to change together.
- Validation drift: external input not validated at entry; stored external payload trusted before parsing; trusted owned state repeatedly revalidated; semantic validation duplicated; silent defaults hide required state.
- Persistence drift: persistence access or schema knowledge leaks into non-owning code, or concrete storage is hidden behind a new one-implementation seam.
- Split/merge drift: separated owners constantly share internals, or one owner contains unrelated capabilities with independent change pressure.
- Cycle camouflage: cycles are hidden with callbacks, events, interfaces, registries, globals, or shared mutable state instead of fixing ownership.
- Hidden fallback: optional paths, swallowed errors, feature gates, no-op branches, or degraded behavior weaken required behavior without an explicit architecture decision.
- Big-bang replacement risk: modernization replaces too much at once without a strangler seam, incremental delivery path, or rollback path.
- Temporary seam without exit: branch-by-abstraction code lacks a switch-over/removal plan or leaves a permanent abstraction after replacement.
- Behavior-changing refactor: work described as refactoring changes observable behavior, API contracts, data semantics, or failure modes.
- Unsafe refactoring: large structural change lacks enough Self-Testing Code or verification evidence to preserve behavior.
- Smell with architecture impact: long method, data class, feature envy, or primitive obsession points to unclear ownership, scattered invariants, poor separation of concerns, or high change cost.
- Command/query confusion: a query mutates state, a command hides important returned domain data, or mixed semantics create unsafe reuse; allow intentional exceptions when the operation naturally combines both.

## Language-specific evidence

Use each language’s boundary mechanisms as evidence. Do not make them the architecture goal.

- Rust: crate boundaries, module boundaries, `pub`/`pub(crate)` exposure, trait ownership, one-implementation traits, inherent methods vs free functions, workspace package dependencies.
- Go: package boundaries, exported identifiers, `internal/`, package cycles, interface ownership at the consumer, concrete structs/functions, command/package APIs.
- TypeScript: package exports, import paths, exported symbols, module APIs, interface ownership, runtime dependency injection, and shared modules.
- Python: package/module APIs, conventional privacy, import paths, service/helper ceremony, shared modules, runtime plugin seams.
- Bash: sourced files as APIs, globals crossing boundaries, shared shell libraries, command wrappers, failure propagation, and environment variable ownership.

## Required output

Return concise findings. No grids or tables.

```md
## Executive summary

- Highest-impact issue first.
- No praise.
- No filler.

## Severity rubric used

- blocker: must fix before acceptance because it creates correctness risk, security exposure, hard repository-constraint violation, architectural break, or serious maintainability regression.
- concern: should fix or explicitly accept as debt because it creates real maintenance, usability, ownership, or evolution cost.
- suggestion: optional improvement only when evidence does not show material architecture or maintainability harm.

## Findings

### 1. Short finding title

Severity: blocker
Category: architecture adherence
Concern reference: exact repository constraint, design concern, or review heuristic
Location: file, symbol, module, package, API, or import path
Evidence: <evidence> quote or exact description
Problem: what is wrong
Why it matters: concrete maintainability, separation-of-concerns, runtime, or evolution impact
Recommended remediation: smallest concrete repair
Scope: local or cross-cutting
Confidence: high, medium, or low

## Review coverage map

List architecture concerns reviewed and whether each had findings.

## False positives / keep as-is

List suspicious-looking code that is justified and why.
```

If there are no findings, keep the same headings, state that no architecture concerns were found, and record justified suspicious items under keep-as-is.
