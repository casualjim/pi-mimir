---
name: review-tasks
description: Review OpenSpec implementation tasks. Use only when an OpenSpec workflow explicitly requests task review for a named change.
---

# review-tasks

Review `tasks.md` for a named OpenSpec change.

## Inputs

- Change name.
- `openspec/changes/<change>/proposal.md`.
- `openspec/changes/<change>/specs/**/*.md`.
- `openspec/changes/<change>/design.md`.
- `openspec/changes/<change>/tasks.md`.

## Scope

- Review only whether `tasks.md` is ready to drive implementation.
- Do not review implementation, code, tests, CI, or archive readiness.
- Do not re-review proposal/specs/design except to check task alignment and coverage.
- Do not edit tasks while reviewing; return findings for a separate revision step.

## Review focus

Check that tasks:

- use parseable checkbox format `- [ ] X.Y Task description`
- are ordered by dependency and implementation flow
- are small enough to complete and verify incrementally
- map back to proposal/spec/design requirements
- include test/update/documentation work where needed
- avoid hidden commit, push, PR, archive, or finishing-branch work
- are implementable without requiring unstated decisions

Also check that:

- tasks cover every required behavior, constraint, migration, and verification need implied by proposal, specs, and design
- tasks contain no orphan or out-of-scope work unrelated to the accepted planning artifacts
- tasks are ordered by dependency so an implementer can work top-to-bottom without hidden prerequisites
- tasks are small, concrete, and actionable enough to complete incrementally
- each task has a clear completion condition and is independently verifiable
- tasks include required test, documentation, configuration, migration, rollout, or cleanup work where relevant
- tasks do not smuggle unresolved design decisions into implementation. If major decisions remain, record a blocker or concern
- tasks preserve the agreed scope and avoid opportunistic refactors, unrelated cleanup, roadmap work, or retrospective content
- tasks avoid extra narrative, research chronology, design rationale, and implementation-story prose

## Output

Return concise findings as prose/bullets. Use severity `blocker`, `concern`, or `suggestion`. Do not use tables or pipe-delimited rows.

- `blocker`: tasks cannot safely drive implementation or will not be tracked correctly by apply.
- `concern`: tasks can continue only if the user accepts the ambiguity/tradeoff.
- `suggestion`: optional clarity improvement.

```md
### <Severity>: <short finding title>

Target artifact: tasks.md
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
