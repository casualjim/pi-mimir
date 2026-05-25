---
name: implement
description: Implement an apply-ready OpenSpec change with verification and optional review handoff before explicit archive.
disable-model-invocation: true
---

# implement

Implement an apply-ready OpenSpec change. Run implementation, verify it, and stop before archive unless a separate review is explicitly requested.

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
6. If verification finds blockers, missing work, or mismatches, invoke the worker subagent again with the findings and required fixes.
7. Repeat verify → fix until implementation is complete or blocked.
8. If the user explicitly asks for implementation review, or if you need a separate review decision after verification, run:

```text
/skill:review-implementation <change-name>
```

Review findings are separate from apply completion and may be returned inline or saved only if the caller explicitly asks.

9. Stop after at most 5 verify/fix iterations unless the user explicitly asks for additional review passes.
10. If unresolved blockers remain after 5 iterations, report them and ask the user for a decision.

## Verification loop rules

- Required tasks must be implemented before implementation is complete.
- Verification failures must be fixed or escalated before implementation is complete.
- Do not require separate review artifacts or specialist review passes to declare implementation complete.
- Separate implementation review is optional and does not rewrite verification facts.
- Do not hide unresolved verification gaps.

## Completion

Implementation is complete when:

- required tasks are implemented
- verification passes

Return:

- files changed
- tasks completed
- verification results
- whether separate review was requested or recommended
- whether the change is ready for explicit archive

## Guardrails

- Do not archive.
- Do not commit, push, create PRs, deploy, or run release steps.
- Do not invent review files.
- Do not mark incomplete work complete.
