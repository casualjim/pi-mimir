---
description: Create, amend, distill, or backprop project SPEC.md with Cavekit
argument-hint: "[bug: <description> | amend <§X.n> | from-code | <idea>]"
---
Use the `cavekit-spec` skill workflow for this request.

Arguments: $ARGUMENTS

Operate on project-root `SPEC.md`. Use the bundled Cavekit `FORMAT.md` reference for the schema and caveman-style spec encoding. When a spec decision is needed, first share relevant context, proposed SPEC.md text or diff, tradeoffs, and recommendation in normal assistant text. Then ask separately with concise decision labels/descriptions under the [user decision policy](../FORMAT.md#user-decisions). Do not put context or diff details in the question field, option descriptions, or previews. Do not edit application code. Do not commit unless explicitly requested.
