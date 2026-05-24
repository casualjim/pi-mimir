---
name: review-proposal
description: Review an OpenSpec proposal artifact. Use only when an OpenSpec workflow explicitly requests proposal review for a named change.
---

# review-proposal

Review `proposal.md` for a named OpenSpec change.

## Inputs

- Change name.
- `openspec/changes/<change>/proposal.md`.
- Original user intent if available.
- Existing specs only when needed to verify capability names.

## Scope

- Review only the proposal as a proposal.
- Do not review implementation, design choices, task breakdown, code, tests, CI, or archive readiness.
- Do not edit the proposal while reviewing; return findings for a separate revision step.

## Review focus

Check that the proposal:

- only describes the change
- describes WHY and a bit of WHAT
- does not describe HOW
- names new/modified capabilities consistently with expected spec paths

Also check that:

- the summary/change statement is concise and unambiguous
- the problem, opportunity, or motivation is clear, with only the background needed to understand why the change is worth doing
- goals, objectives, and expected benefits or outcomes are stated at proposal level
- proposed changes describe WHAT will change at a high level, including new, modified, or removed capabilities clearly enough for specs to follow
- affected users, systems, APIs, dependencies, compatibility, or operational impact are identified when relevant
- risks, constraints, caveats, and open questions are visible at proposal level without turning into design detail
- proposed capabilities trace to user intent and accepted specs where applicable, with no orphan or unrelated changes
- the proposal is void of extra narrative: it does not turn research process, discovery chronology, rejected investigation paths, or agent reasoning into a cohesive story
- the proposal remains logical, credible, and objective, and avoids unrelated history, roadmap, retrospective, or implementation-planning content
- detailed architecture, API design, task breakdown, tests, CI, and implementation mechanics are deferred to downstream artifacts

## Output

Return concise findings as prose/bullets. Use severity `blocker`, `concern`, or `suggestion`. Do not use tables or pipe-delimited rows.

- `blocker`: proposal cannot safely drive specs/design/tasks.
- `concern`: proposal can continue only if the user accepts the ambiguity/tradeoff.
- `suggestion`: optional clarity improvement.

```md
### <Severity>: <short finding title>

Target artifact: proposal.md
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
