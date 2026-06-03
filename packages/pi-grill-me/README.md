# @casualjim/pi-grill-me

Pi package based on Matt Pocock's `grill-with-docs` skill.

It packages the `grill-with-docs` workflow for Pi and instructs the agent to use `ask_user_question` when that tool is already available. It does not install or depend on any question UI package.

## What it loads

- Extension: `index.ts`
- Skill: `skills/engineering/grill-with-docs/SKILL.md`
- Question UI: none bundled; uses `ask_user_question` only when already available

## Commands

```text
/grill <plan or topic>
/grill-with-docs <plan or topic>
/grill status
/grill stop
/skill:grill-with-docs <plan or topic>
```

## Behavior

- Starts a Socratic grilling session against existing domain language and docs.
- Instructs the agent to inspect code/docs when that can answer a question.
- Prefers codebase-memory tools for codebase research before exact file reads.
- Soft-delegates large code fact-finding to `cavecrew-investigator` when `subagent` lists it as executable; falls back to codebase-memory/direct reads when unavailable.
- Instructs the agent to use `ask_user_question` for each user-facing grilling question when available.
- Keeps Matt Pocock's documentation habits: update `CONTEXT.md` inline for resolved domain terms, and offer ADRs only for hard-to-reverse, surprising, real trade-off decisions.

## Attribution

The bundled `grill-with-docs` skill content is adapted from Matt Pocock's `mattpocock/skills` repository. See `THIRD_PARTY_NOTICES.md`.
