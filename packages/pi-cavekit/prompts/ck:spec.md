---
description: Create, amend, distill, or backprop project SPEC.md with Cavekit
argument-hint: "[bug: <description> | amend <§X.n> | from-code | <idea>]"
---
Use the `cavekit-spec` skill workflow for this request.

Arguments: $ARGUMENTS

Operate on project-root `SPEC.md`. Use the bundled Cavekit `FORMAT.md` reference for the schema and caveman-style spec encoding. When a decision is needed, first share context/plan/diff/tradeoffs in normal assistant text. Then invoke `ask_user_question` separately with only concise decision labels/descriptions. Do not put the plan in the question field, option descriptions, or previews. Do not edit application code. Do not commit unless explicitly requested.
