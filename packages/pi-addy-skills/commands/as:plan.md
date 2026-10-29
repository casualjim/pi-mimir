---
description: Break work into small verifiable tasks with acceptance criteria and dependency ordering
---

Use the `planning-and-task-breakdown` skill workflow for this request.

Read the existing spec (SPEC.md or equivalent) and the relevant codebase sections. On omp, get the lay of the land with codebase-memory `get_architecture` and `search_graph` instead of bulk file reads. Then:

1. Enter plan mode — read only, no code changes
2. Identify the dependency graph between components
3. Slice work vertically (one complete path per task, not horizontal layers)
4. Write tasks with acceptance criteria and verification steps
5. Add checkpoints between phases
6. Present the plan for human review

Save the plan to tasks/plan.md and task list to tasks/todo.md, and mirror the task list into the host's todo tool so progress is trackable in-session.

If tasks/plan.md or tasks/todo.md already exists with unchecked tasks for different work, stop and ask before writing — never silently overwrite an incomplete plan.
