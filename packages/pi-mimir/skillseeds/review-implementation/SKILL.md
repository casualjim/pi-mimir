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

## Workflow

Invoke the `reviewer` agent as concurrent subagents for lower-level implementation review. Each reviewer-agent task prompt must start exactly with the skill invocation shown here:

1. `/skill:review-architecture <change-name>`
2. `/skill:review-tests <change-name>`
3. `/skill:review-data-flow <change-name>`
4. `/skill:review-security <change-name>`

Pass only the context each reviewer needs: proposal, specs, design, tasks, relevant implementation evidence, CI/test output, logs, and nearby repository context needed to ground findings.

Collect findings, deduplicate them, and report the highest-severity actionable set.

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

Return concise findings as prose/bullets. Use severity `blocker`, `concern`, or `suggestion`. Do not use tables or pipe-delimited rows.

```md
### <Severity>: <short finding title>

Location: <section, line, or path>
Evidence: <quoted or summarized evidence>
Problem: <what is wrong>
Impact: <why it matters>
Recommended fix: <smallest concrete fix>
```

If no issues are found, return `No issues found`.
