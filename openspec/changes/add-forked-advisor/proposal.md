## Why

`packages/advisor/` exists only as a placeholder package, while pi-mimir's workspace design already assumes a dedicated advisor package alongside the main workflow package. We need to turn that placeholder into a real advisor package now so the workspace can offer a configurable second-opinion path without reusing rpiv-advisor's in-process `completeSimple` handoff.

## What Changes

- Create a real `packages/advisor/` Pi package by importing the relevant configuration, UI, and activation patterns from `@juicesharp/rpiv-advisor`.
- Replace rpiv-advisor's in-process consultation flow with a forked child advisor session that inherits parent branch context and returns concise plan/correction/stop guidance.
- Integrate the advisor package with pi-mimir's existing review-oriented agent setup, using a forked advisory lane rather than a fresh-context review pass.
- Add recursion guards so advisor child sessions cannot escalate through the advisor tool again.
- Document and test the forked advisor behavior, package registration, and configuration persistence.

## Capabilities

### New Capabilities
- `advisor-configuration`: Configure, persist, enable, disable, and selectively block an advisor model for pi-mimir sessions.
- `forked-advisor-consultation`: Run advisor consultations as forked child sessions that inherit parent branch context and return advisory guidance without directly acting on the user's behalf.

### Modified Capabilities
- None.

## Impact

- Affects `packages/advisor/` package structure, runtime extension behavior, prompts, and tests.
- Depends on Pi subagent/forked-session behavior instead of `completeSimple` side-call behavior.
- May add or tighten workspace package dependencies needed for advisor configuration UI and forked advisory execution.
- Adds user-facing advisor configuration and usage documentation for the workspace.
