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

Treat the review as single-shot: inspect the full in-scope implementation evidence now, surface all actionable issues observable from the current evidence, and do not intentionally save findings for later rounds.
Collect findings, deduplicate them, and report the complete actionable issue list in one pass. Do not stop after the highest-severity class, the first few issues, or a representative sample.
After the reported findings are addressed, a follow-up review over unchanged implementation material should ideally report only net new issues introduced by the changes or made newly reviewable by newly supplied evidence.
If a later-round issue comes from previously reviewed material, explicitly state why it was not reliably reviewable earlier.

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

Generate a complete implementation review report: summary scorecard, issues grouped by priority, and final assessment.
Report the whole issue list; do not limit output to the highest-severity actionable set.

Use these priorities:

- `blocker` (must fix before acceptance): implementation violates required behavior, introduces a serious correctness, security, or performance risk, lacks required evidence, or contradicts the change artifacts.
- `concern` (should fix or explicitly accept): implementation may still proceed only if the user accepts the ambiguity, trade-off, or debt.
- `suggestion` (nice to fix): optional clarity, resilience, or maintainability improvement.

Use clear markdown with this structure:

```md
## Implementation Review Report: <change-name>

### Summary
| Dimension | Status |
|-----------|--------|
| Spec/design/task alignment | Pass/Issues |
| Tests and CI evidence | Pass/Issues |
| Architecture and integration | Pass/Issues |
| Data flow and performance | Pass/Issues |
| Security and trust boundaries | Pass/Issues |
| Config and generated assets | Pass/Issues |

### Issues by Priority

#### BLOCKER (Must fix before acceptance)
- **<short finding title>**
  - Target artifact: <file, config, generated asset, or task/design/spec path>
  - Upstream artifact: <artifact path or none>
  - Requires user decision: <yes/no>
  - Review area: <architecture/tests/data-flow/security/integrated>
  - Location: <section, line, or path>
  - Evidence: <quoted or summarized evidence>
  - Problem: <what is wrong>
  - Impact: <why it matters>
  - Recommendation: <smallest concrete fix>

#### CONCERN (Should fix or explicitly accept)
- **<short finding title>**
  - Target artifact: <file, config, generated asset, or task/design/spec path>
  - Upstream artifact: <artifact path or none>
  - Requires user decision: <yes/no>
  - Review area: <architecture/tests/data-flow/security/integrated>
  - Location: <section, line, or path>
  - Evidence: <quoted or summarized evidence>
  - Problem: <what is wrong>
  - Impact: <why it matters>
  - Recommendation: <smallest concrete fix>

#### SUGGESTION (Nice to fix)
- **<short finding title>**
  - Target artifact: <file, config, generated asset, or task/design/spec path>
  - Upstream artifact: <artifact path or none>
  - Requires user decision: <yes/no>
  - Review area: <architecture/tests/data-flow/security/integrated>
  - Location: <section, line, or path>
  - Evidence: <quoted or summarized evidence>
  - Problem: <what is wrong>
  - Impact: <why it matters>
  - Recommendation: <smallest concrete fix>

### Final Assessment
- If blocker issues exist: "X blocker issue(s) found. Fix before acceptance."
- If only concern issues exist: "No blocker issues. Y concern(s) require fixes or explicit acceptance before acceptance."
- If only suggestion issues exist: "No blocker or concern issues. Z suggestion(s) to consider."
- If no issues exist: "No issues found. Ready for acceptance."
```

If a priority section has no issues, write `None` under that heading. Keep coverage focused on actionable findings, but do not omit lower-priority findings just because higher-priority ones exist.
