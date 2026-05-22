---
name: review-proposal
description: Review an OpenSpec proposal artifact. Use only when an OpenSpec workflow explicitly requests proposal review for a named change.
---

# review-proposal

Review `proposal.md` for a named OpenSpec change.

## Inputs

- Change name.
- `openspec/changes/<change>/proposal.md`.
- Existing specs only when needed to verify capability names.

## Review focus

Check that the proposal:

- only describes the change;
- is not part of some larger historical narrative;
- describes WHY and a bit of WHAT;
- does not describe HOW;
- names new/modified capabilities consistently with expected spec paths;
- lists impact and non-goals/out-of-scope areas clearly enough to constrain later artifacts.

## Output

Return concise findings. Use severity `blocker`, `concern`, or `suggestion`.

```text
<severity> | <location> | <evidence> | <problem> | <impact> | <recommended fix>
```

If no issues are found, return `No issues found`.
