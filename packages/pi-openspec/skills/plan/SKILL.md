---
name: plan
description: Plan an OpenSpec change. Use for proposal, specs, design, tasks, and planning review gates before implementation.
---

# plan

Top-level OpenSpec planning workflow. It coordinates artifact creation and planning review gates. It does not produce a single output artifact itself.

## Workflow

1. Resolve the change name from explicit input, conversation context, or `openspec list --json`.
2. If intent is unclear, ask a targeted clarification before codebase probing.
3. Use `openspec status --change <name> --json` and `openspec instructions <artifact-id> --change <name> --json` as source of truth.
4. Create or update proposal, specs, design, and tasks as OpenSpec artifacts.
5. Run planning review gates by invoking the individual review skills:
   - `review-proposal`
   - `review-specs`
   - `review-design`
   - `review-tasks`
6. Fix blockers. Fix or ask the user to explicitly accept concerns. Treat suggestions as optional.
7. Stop when planning artifacts pass review and are ready for `implement`.

## Guardrails

- Do not write application code.
- Do not create a plan workflow artifact.
- Do not run git commit, git push, PR creation, archive, or finishing-branch behavior.
