---
description: Spare-budget design pass. Make one shallow module deep — smaller interface, behavior held, tests green before and after.
argument-hint: "[module/path | \"improve the design\"]"
---
Use the `cavekit-deepen` skill workflow for this request.

Arguments: $ARGUMENTS

Pick the single shallowest module the spec touches, diagnose the design defect at file:line, research a deeper shape (hand the external case to `cavekit-research` → §R), and propose §I/§V/§T edits to `cavekit-spec`. Behavior is sacred — full suite green before AND after. Do not write `SPEC.md` directly; defer all writes to `cavekit-spec`. Do not commit unless explicitly requested.
