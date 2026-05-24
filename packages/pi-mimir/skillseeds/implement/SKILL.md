---
name: implement
description: Implement an apply-ready OpenSpec change with verification, implementation review, and explicit archive handoff.
---

# implement

Implement an apply-ready OpenSpec change. Run implementation, verify it, review it, and iterate until blockers and concerns are resolved.

## Inputs

- Change name
- Apply-ready OpenSpec change
- Existing OpenSpec artifacts
- Existing conversation context

## Workflow

1. Resolve the change name from input or ask for it.
2. Run `openspec status --change <name> --json` and stop if the change is not apply-ready.
3. Run `openspec instructions apply --change <name> --json`.
4. Invoke the worker subagent with the apply instructions, task file, context files, and implementation scope.
5. Verify implementation against proposal, specs, design, and tasks.
6. Run implementation review gates in parallel as reviewer subagents:

```text
/skill:review-architecture <change-name>
/skill:review-tests <change-name>
/skill:review-data-flow <change-name>
/skill:review-security <change-name>
```

7. Collect review findings.
8. If findings contain only suggestions or no issues, stop.
9. If findings contain blockers or concerns, invoke the worker subagent again with the findings and required fixes.
10. Repeat verify → review → fix until blockers and concerns are resolved.
11. Stop after at most 5 review/fix iterations.
12. If unresolved blockers or concerns remain after 5 iterations, report them and ask the user for a decision.

## Review loop rules

- Blockers must be fixed before implementation is complete.
- Concerns must be fixed or explicitly accepted by the user.
- Suggestions do not block implementation completion.
- Deduplicate findings before sending them back to the worker.
- Preserve reviewer wording for evidence, impact, and recommended fix.
- Do not hide unresolved findings.

## Completion

Implementation is complete when:

- required tasks are implemented
- verification passes
- review gates report no blockers
- review gates report no unresolved concerns

Return:

- files changed
- tasks completed
- verification results
- review status
- remaining suggestions
- whether the change is ready for explicit archive

## Guardrails

- Do not archive.
- Do not commit, push, create PRs, deploy, or run release steps.
- Do not mark incomplete work complete.
