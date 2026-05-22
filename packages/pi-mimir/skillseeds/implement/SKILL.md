---
name: implement
description: Implement an apply-ready OpenSpec change. Use for apply execution, verification, and implementation review before explicit archive.
---

# implement

Top-level OpenSpec implementation workflow. It coordinates apply, verification, and implementation review. It does not produce a single output artifact itself.

## Workflow

1. Resolve the change name from explicit input, conversation context, or `openspec list --json`.
2. Verify apply readiness with `openspec status --change <name> --json`.
3. Read `openspec instructions apply --change <name> --json` and every context file it returns.
4. Implement pending tasks incrementally. Mark a task checkbox complete only after the corresponding implementation is done.
5. Verify implementation against proposal, specs, design, and tasks.
6. Run implementation review by invoking `review-implementation`.
7. Fix blockers. Fix or ask the user to explicitly accept concerns. Treat suggestions as optional.
8. Stop before explicit archive. Tell the user generated OpenSpec archive behavior can be run separately when gates pass.

## Guardrails

- Do not create an implement workflow artifact.
- Do not run archive, git commit, git push, PR creation, or finishing-branch behavior.
