---
name: review-design
description: Review an OpenSpec design artifact. Use only when an OpenSpec workflow explicitly requests design review for a named change.
---

# review-design

Review `design.md` for a named OpenSpec change.

## Inputs

- Change name.
- `openspec/changes/<change>/design.md`.
- Proposal and specs for consistency checks.

## Review focus

Check that the design:

- is possible;
- is optimal;
- is the simplest possible approach for the best possible implementation;
- describes HOW the change will be implemented;
- contains everything an executive needs to understand the work involved;
- contains everything an engineer needs to implement the work;
- contains concrete decisions, rationale, alternatives considered, risks, and trade-offs;
- explains integration points, migration/rollout concerns, and failure modes when relevant;
- answers "what did we miss?" for constraints, alternatives, assumptions, data flow, ownership, operational concerns, rollback, migration, security, performance, and failure modes;
- stays coherent with proposal and specs;
- avoids drifting into task checklist detail that belongs in `tasks.md`.

## Output

Return concise findings. Use severity `blocker`, `concern`, or `suggestion`.

```text
<severity> | <location> | <evidence> | <problem> | <impact> | <recommended fix>
```

If no issues are found, return `No issues found`.
