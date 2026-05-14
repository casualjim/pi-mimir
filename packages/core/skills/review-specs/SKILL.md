---
name: review-specs
description: Review OpenSpec delta specs. Use only when an OpenSpec workflow explicitly requests specs review for a named change.
---

# review-specs

Review `specs/**/*.md` for a named OpenSpec change.

## Inputs

- Change name.
- Proposal.
- All delta spec files under `openspec/changes/<change>/specs/`.
- Accepted specs when checking MODIFIED/REMOVED/RENAMED behavior.

## Review focus

Check that specs:

- match the proposal's declared capabilities;
- use valid delta sections: ADDED, MODIFIED, REMOVED, RENAMED;
- use normative SHALL/MUST language;
- define requirements at behavior level, not implementation detail level;
- include at least one `#### Scenario:` per requirement;
- use testable WHEN/THEN scenarios with important success, failure, and edge cases;
- copy full existing requirement blocks for MODIFIED requirements;
- avoid contradictions or duplicate requirements across capabilities.

## Output

Return concise findings. Use severity `blocker`, `concern`, or `suggestion`.

```text
<severity> | <location> | <evidence> | <problem> | <impact> | <recommended fix>
```

If no issues are found, return `No issues found`.
