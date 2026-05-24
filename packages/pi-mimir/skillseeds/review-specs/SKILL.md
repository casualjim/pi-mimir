---
name: review-specs
description: Review OpenSpec delta specs. Use only when an OpenSpec workflow explicitly requests specs review for a named change.
---

# review-specs

Review `specs/**/*.md` for a named OpenSpec change.

## Inputs

- Change name.
- `openspec/changes/<change>/proposal.md`.
- All delta spec files under `openspec/changes/<change>/specs/`.
- Accepted specs under `openspec/specs/<capability>/spec.md` when checking MODIFIED/REMOVED/RENAMED behavior.

## Scope

- Review only whether the specs precisely define WHAT behavior changes.
- Do not review design choices, task breakdown, implementation, code, tests, CI, or archive readiness.
- Do not edit specs while reviewing; return findings for a separate revision step.

## Review focus

Check that specs:

- match the proposal's declared capabilities
- use valid delta sections: ADDED, MODIFIED, REMOVED, RENAMED
- use normative SHALL/MUST language
- define requirements at behavior level, not implementation detail level
- include at least one `#### Scenario:` per requirement
- use testable WHEN/THEN scenarios with important success, failure, and edge cases
- copy full existing requirement blocks for MODIFIED requirements
- avoid contradictions or duplicate requirements across capabilities

Also check that:

- specs are scenario-based delta specifications: they define WHAT observable behavior changes, not HOW implementation will work
- every requirement is necessary and traceable to the proposal/user intent or an existing accepted spec change, with no orphan specs or missing proposed capabilities
- every requirement is singular, unambiguous, complete enough, consistent, feasible, and bounded to this change
- every requirement uses normative language and avoids vague, aspirational, subjective, or implementation-only wording
- every requirement is verifiable/testable: a reviewer can derive concrete acceptance tests from its scenarios
- every requirement has at least one `#### Scenario:` with a clear WHEN trigger and observable THEN outcome
- scenarios are concrete examples that illustrate the requirement/rule, not story narration, research chronology, or implementation steps
- the scenario set is efficient: it covers important success, failure, permission/security, boundary, edge, compatibility, and migration cases where relevant without duplicating the same proof
- each spec file corresponds to a capability named in the proposal, and capability names/paths match OpenSpec expectations
- ADDED/MODIFIED/REMOVED/RENAMED sections use valid OpenSpec delta headings and semantics
- MODIFIED requirements include the full updated requirement block and preserve the exact existing requirement name when changing existing behavior
- REMOVED requirements include reason and migration guidance
- unresolved behavior questions are explicit blockers/concerns, not silently encoded as ambiguous requirements
- specs avoid extra narrative, design rationale, roadmap, retrospective, task planning, tests/CI detail, and implementation mechanics

## Output

Return concise findings as prose/bullets. Use severity `blocker`, `concern`, or `suggestion`. Do not use tables or pipe-delimited rows.

- `blocker`: specs cannot safely drive design/tasks/implementation or will fail OpenSpec validation/archive semantics.
- `concern`: specs can continue only if the user accepts the ambiguity/tradeoff.
- `suggestion`: optional clarity improvement.

```md
### <Severity>: <short finding title>

Target artifact: specs/**/*.md
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
