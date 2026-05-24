---
name: plan
description: Plan an OpenSpec change by generating proposal artifacts, reviewing them, and iterating until review gates pass.
---

# plan

Plan an OpenSpec change. Generate planning artifacts, review them, and iterate until blockers and concerns are resolved.

## Inputs

- Change name
- User intent
- Existing conversation context
- Existing OpenSpec artifacts, if any

## Workflow

1. Resolve the change name from input or ask for it.
2. Invoke the planner subagent. The prompt MUST start with:

```text
/skill:openspec-propose <change-name>
```

3. After proposal, specs, design, and tasks exist, run planning review gates concurrently as reviewer subagents. Each subagent reviews exactly one primary artifact file for both document structure and content appropriate to that document type:

```text
/skill:review-proposal <change-name>
/skill:review-specs <change-name>
/skill:review-design <change-name>
/skill:review-tasks <change-name>
```

4. Collect all review findings after the concurrent review batch completes.
5. If findings contain only suggestions or no issues, stop.
6. If findings contain blockers or concerns, update only the targeted artifact using its OpenSpec instructions and dependency artifacts; do not rerun full proposal generation over all artifacts.
7. If a finding identifies an upstream artifact problem, update that upstream artifact and include affected artifacts in the next concurrent review batch.
8. If a finding requires a product, scope, or design decision that is not in the artifacts, ask the user instead of guessing.
9. Repeat concurrent review batch → targeted fixes until blockers and concerns are resolved.
10. Stop after at most 5 review/fix iterations.
11. If unresolved blockers or concerns remain after 5 iterations, report them and ask the user for a decision.

## Review loop rules

- Blockers must be fixed before planning is complete.
- Concerns must be fixed or explicitly accepted by the user.
- Suggestions do not block planning completion.
- Deduplicate findings before sending them back for artifact-specific fixes.
- Preserve reviewer wording for target artifact, upstream artifact, decision needs, evidence, impact, and recommended fix.
- Do not hide unresolved findings.

## Completion

Planning is complete when:

- proposal exists
- specs exist
- design exists
- tasks exist
- review gates report no blockers
- review gates report no unresolved concerns

Return:

- artifacts created or updated
- review status
- remaining suggestions
- whether the change is ready for `implement`

## Guardrails

- Do not write application code.
- Do not perform implementation.
- Do not archive.
- Do not commit, push, create PRs, deploy, or run release steps.
