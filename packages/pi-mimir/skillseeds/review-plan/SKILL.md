---
name: review-plan
description: Review OpenSpec planning artifacts in one coherent pass. Use only when an OpenSpec workflow or user explicitly requests planning review for a named change.
---

# review-plan

Review proposal, specs, design, and tasks for a named OpenSpec change as one planning set.

## Inputs

- Change name.
- `openspec/changes/<change>/proposal.md`.
- All delta spec files under `openspec/changes/<change>/specs/`.
- `openspec/changes/<change>/design.md`.
- `openspec/changes/<change>/tasks.md`.
- Accepted specs under `openspec/specs/<capability>/spec.md` when checking modified or removed behavior.
- Existing specs and repository context only when needed to judge capability naming, consistency, or feasibility.
- OpenSpec status/instruction output when available.

## Scope

- Review only whether the planning artifacts are sufficient, coherent, and ready to drive implementation.
- Review proposal/specs/design/tasks together as one planning review.
- Do not review implementation, code, tests, CI, or archive readiness.
- Do not edit artifacts while reviewing; return findings for a separate revision step.
- Return findings inline by default. Only write a review file if the caller explicitly asks.

## Workflow

1. Read proposal, specs, design, and tasks together as one planning set.
2. Route every finding to one target artifact. If the root cause belongs upstream, name that upstream artifact explicitly.
3. Prefer one integrated review over mechanical fan-out.
4. Collect findings, deduplicate them, and report the highest-severity actionable set.
5. Fix blockers by updating only the targeted planning artifact, or report them as required changes.
6. If a finding points to an upstream artifact, route the finding to that artifact.
7. Fix concerns or ask the user to explicitly accept them.
8. Ask the user when a finding requires a product, scope, or design decision that is not already in the artifacts.
9. Treat suggestions as optional.

Do not write application code. Do not run apply, archive, git commit, git push, PR creation, or finishing-branch behavior.

## Review focus

### Proposal checks

Check that the proposal:

- only describes the change;
- explains WHY and high-level WHAT without drifting into HOW;
- states the problem, opportunity, motivation, expected benefit, scope boundaries, and impact clearly;
- names new and modified capabilities consistently with expected spec paths;
- identifies affected users, systems, APIs, dependencies, compatibility, risks, constraints, caveats, and open questions when relevant;
- avoids extra narrative such as research chronology, rejected investigation paths, roadmap, retrospective, or implementation-planning content.

### Specs checks

Check that specs:

- match the proposal's declared capabilities;
- use valid delta sections: ADDED, MODIFIED, REMOVED, RENAMED;
- use normative SHALL/MUST language;
- define behavior, not implementation mechanics;
- include at least one `#### Scenario:` per requirement;
- use concrete, testable WHEN/THEN scenarios with important success, failure, edge, compatibility, permission, migration, and boundary cases where relevant;
- preserve full existing requirement blocks for MODIFIED requirements;
- include reason and migration for REMOVED requirements;
- avoid contradictions, duplicate requirements, orphan spec files, and ambiguous requirements.

### Design checks

Check that the design:

- explains HOW the change will be implemented;
- traces to proposal goals and spec requirements;
- contains concrete decisions, rationale, trade-offs, risks, alternatives, and integration points;
- addresses migration, rollout, rollback, failure modes, and operational concerns where relevant;
- is technically feasible and keeps scope explicit;
- avoids drifting into task checklist detail.

### Tasks checks

Check that tasks:

- use parseable checkbox format `- [ ] X.Y Task description`;
- are ordered by dependency and implementation flow;
- are small, concrete, and independently verifiable;
- map back to proposal, specs, and design;
- cover required implementation, test, documentation, configuration, migration, rollout, or cleanup work where relevant;
- avoid hidden commit, push, PR, archive, or finishing-branch work;
- do not smuggle unresolved design decisions into implementation.

### Cross-artifact coherence checks

Check that the planning artifacts as a set:

- stay consistent with each other;
- do not contradict on scope, capabilities, behavior, decisions, or sequencing;
- contain no orphan design elements or tasks unrelated to proposal/specs;
- are ready to drive implementation only after blocker findings are resolved.

## Output

Return concise findings as prose/bullets. Use severity `blocker`, `concern`, or `suggestion`. Do not use tables or pipe-delimited rows.

- `blocker`: planning cannot safely drive implementation.
- `concern`: planning can continue only if the user explicitly accepts the ambiguity or trade-off.
- `suggestion`: optional clarity improvement.

```md
### <Severity>: <short finding title>

Target artifact: <artifact path>
Upstream artifact: <artifact path or none>
Requires user decision: <yes/no>
Location: <section, line, or path>
Evidence: <quoted or summarized evidence>
Problem: <what is wrong>
Impact: <why it matters>
Recommended fix: <smallest concrete fix>
```

If asked to write a review artifact, use this prose/bullet structure and do not turn it into a table:

```md
# Planning Artifact Review

## Review Target

## Decision

- [ ] Pass
- [ ] Pass with concerns
- [ ] Fail

## Blockers

## Concerns

## Suggestions

## Required Fixes

## Evidence
```

Record evidence, whether a user decision is required, and the smallest concrete fix. If no issues are found, return `No issues found` or mark Decision as Pass and leave findings sections empty.
