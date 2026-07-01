---
description: Interrogate a fuzzy idea into §G/§C before spec. One question at a time, recommend answer each rung.
argument-hint: "[idea | \"grill me\"]"
---
Use the `cavekit-grill` skill workflow for this request.

Arguments: $ARGUMENTS

Calibrate pressure, climb the question ladder one question at a time with a recommended answer each rung, and hand the sharpened §G/§C to `cavekit-spec`. Park unresolved unknowns as `?` items — never guess a constraint. Use `ask_user_question` for each rung and for calibration; share recommendation context in normal assistant text first. Do not write `SPEC.md` directly; defer all writes to `cavekit-spec`. Do not commit unless explicitly requested.
