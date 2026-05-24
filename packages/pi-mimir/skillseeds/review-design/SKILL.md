---
name: review-design
description: Review an OpenSpec design artifact. Use only when an OpenSpec workflow explicitly requests design review for a named change.
---

# review-design

Review `design.md` for a named OpenSpec change.

## Inputs

- Change name.
- `openspec/changes/<change>/design.md`.
- `openspec/changes/<change>/proposal.md`.
- `openspec/changes/<change>/specs/**/*.md`, if present and needed to check requirements alignment.

## Scope

- Review only whether the design is sufficient to guide implementation.
- Do not review proposal quality, task breakdown, implementation, code, tests, CI, or archive readiness.
- Do not edit the design while reviewing; return findings for a separate revision step.

## Review focus

Check that the design:

- describes HOW the change will be implemented
- contains concrete decisions, rationale, alternatives considered, risks, and trade-offs
- explains integration points, migration/rollout concerns, and failure modes when relevant
- stays coherent with proposal and specs
- avoids drifting into task checklist detail that belongs in `tasks.md`

Also check that:

- scope and non-scope are explicit enough to bound the design
- design traces to proposal goals and specs/requirements, with no orphan design elements or missing required behavior
- design describes the chosen HOW: architecture/solution strategy, components, interfaces/APIs, data or state model, runtime flows, and deployment/operational shape where relevant
- key decisions include rationale, trade-offs, and credible alternatives considered
- the chosen approach is technically feasible and the simplest viable design for the stated goals, constraints, and risks
- relevant quality and cross-cutting concerns are addressed: reliability, security, privacy, performance, observability, maintainability, migration/rollback as applicable
- risks, open questions, and known technical debt are visible

## Output

Return concise findings as prose/bullets. Use severity `blocker`, `concern`, or `suggestion`. Do not use tables or pipe-delimited rows.

- `blocker`: design cannot safely drive tasks or implementation.
- `concern`: design can continue only if the user accepts the ambiguity/tradeoff.
- `suggestion`: optional clarity improvement.

```md
### <Severity>: <short finding title>

Target artifact: design.md
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
