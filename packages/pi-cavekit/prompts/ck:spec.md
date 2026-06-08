---
description: Create, amend, distill, or backprop project SPEC.md with Cavekit
argument-hint: "[bug: <description> | amend <§X.n> | from-code | <idea>]"
---
Use the `cavekit-spec` skill workflow for this request.

Arguments: $ARGUMENTS

Operate on project-root `SPEC.md`. Use the bundled Cavekit `FORMAT.md` reference for the schema and caveman-style spec encoding. When a decision is needed, explain context/plan/diff/tradeoffs before calling `ask_user_question`; do not hide the plan in option descriptions. Do not edit application code. Do not commit unless explicitly requested.
