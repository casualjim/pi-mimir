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

3. After proposal, specs, design, and tasks exist, run review gates in parallel as reviewer subagents:

```text
/skill:review-proposal <change-name>
/skill:review-specs <change-name>
/skill:review-design <change-name>
/skill:review-tasks <change-name>
```

4. Collect review findings.
5. If findings contain only suggestions or no issues, stop.
6. If findings contain blockers or concerns, invoke `/skill:openspec-propose <change-name>` again with the findings to update artifacts.
7. Repeat review → propose until blockers and concerns are resolved.
8. Stop after at most 5 review/propose iterations.
9. If unresolved blockers or concerns remain after 5 iterations, report them and ask the user for a decision.

## Review loop rules

- Blockers must be fixed before planning is complete.
- Concerns must be fixed or explicitly accepted by the user.
- Suggestions do not block planning completion.
- Deduplicate findings before sending them back to propose.
- Preserve reviewer wording for evidence, impact, and recommended fix.
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
