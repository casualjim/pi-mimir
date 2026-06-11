---
description: Plan and execute selected Cavekit SPEC.md tasks
argument-hint: "[§T.n | --next | --all]"
---
Use the `cavekit-build` skill workflow for this request.

Arguments: $ARGUMENTS

Read project-root `SPEC.md`, select tasks from §T according to the arguments, and plan against cited §V invariants and §I interfaces. Before asking for approval, share the full plan in normal assistant text: selected tasks, cited §V/§I, files to edit/create, tests, verification commands, tradeoffs, and recommendation. Then invoke `ask_user_question` separately with only concise decision controls. Do not put the plan in the question field, option descriptions, or previews. Execute only approved or requested task scope. Do not commit unless explicitly requested.
