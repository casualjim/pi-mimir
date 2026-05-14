---
name: review-tasks
description: Review OpenSpec implementation tasks. Use only when an OpenSpec workflow explicitly requests task review for a named change.
---

# review-tasks

Review `tasks.md` for a named OpenSpec change.

## Inputs

- Change name.
- Proposal, specs, design.
- `openspec/changes/<change>/tasks.md`.

## Review focus

Check that tasks:

- use parseable checkbox format `- [ ] X.Y Task description`;
- are ordered by dependency and implementation flow;
- are small enough to complete and verify incrementally;
- map back to proposal/spec/design requirements;
- include test/update/documentation work where needed;
- avoid hidden commit, push, PR, archive, or finishing-branch work;
- are implementable without requiring unstated decisions.

## Output

Return concise findings. Use severity `blocker`, `concern`, or `suggestion`.

```text
<severity> | <location> | <evidence> | <problem> | <impact> | <recommended fix>
```

If no issues are found, return `No issues found`.
