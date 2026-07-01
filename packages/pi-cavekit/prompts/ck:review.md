---
description: Adversarial senior review of the spec before build. Refute, don't rubber-stamp. Ends in a go/no-go gate.
argument-hint: "[§T.n | --all]"
---
Use the `cavekit-review` skill workflow for this request.

Arguments: $ARGUMENTS

Construct a senior reviewer whose authority comes from the codebase, §R, and live best-practice, then try to refute the spec (§G §C §I §R §V §T). Every finding cites evidence — file:line or source; flag unverifiable ones `[unverified]`. Draft §V lines for HARDEN findings and hand them to `cavekit-spec`. End on an explicit GO / NO-GO gate; share the verdict in normal assistant text, then use `ask_user_question` only for the gate decision. Do not write `SPEC.md` directly; defer all writes to `cavekit-spec`. Do not commit unless explicitly requested.
