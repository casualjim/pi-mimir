---
name: review-implementation
description: Review delivered code, CI, config, and generated assets against an OpenSpec change. Use only when an OpenSpec workflow explicitly requests implementation review.
---

# review-implementation

Review implementation work for a named OpenSpec change.

## Inputs

- Change name.
- Proposal, specs, design, tasks.
- Code diff, changed config, generated assets, CI/test output, and relevant logs.

## Review focus

Check that the implementation:

- satisfies proposal, specs, design, and completed tasks;
- has meaningful tests or CI evidence for required behavior and regressions;
- updates config/package/generated assets correctly and consistently;
- respects ownership boundaries and integration points;
- avoids security, trust-boundary, shell/path injection, and secret-handling risks;
- avoids relevant performance/resource regressions;
- does not include commit, push, PR, archive, or finishing-branch behavior.

## Output

Return concise findings. Use severity `blocker`, `concern`, or `suggestion`.

```text
<severity> | <location> | <evidence> | <problem> | <impact> | <recommended fix>
```

If no issues are found, return `No issues found`.
