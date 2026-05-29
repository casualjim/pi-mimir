---
name: cavekit-build
description: Plan and execute implementation against Cavekit SPEC.md. Use when users invoke /ck:build, ask to build from SPEC.md, implement Cavekit tasks, build the next task, or run a selected §T task.
---

# cavekit-build — implement SPEC.md tasks

Single-thread plan-then-execute against project-root `SPEC.md`. No swarm, hooks, or runtime orchestration.

Read bundled `../../FORMAT.md` before parsing task status or spec references. The bundled file defines format; project-root `SPEC.md` is the working artifact.

## Load

1. Read `SPEC.md` from project root. If missing, tell the user to invoke `/ck:spec` first and stop.
2. Parse invocation args:
   - `§T.n` or `Tn` → that task only
   - `--next` → lowest-numbered row with status `.` or `~`
   - `--all` or no args → every `.` row in §T order
3. Identify applicable §V invariants and §I interfaces for chosen task(s).

## Plan

For the chosen task(s), produce a concise plan before editing:

1. Cite each §V invariant that applies.
2. Cite each §I interface touched.
3. List files to create or edit.
4. List tests to add or update, with at least one check per touched invariant when practical.
5. Name verification commands.

Wait for user approval unless the user explicitly asked for autonomous execution.

## Execute

Per task in order:

1. Flip selected §T row status from `.` to `~` in `SPEC.md`.
2. Make minimal code/test/doc changes for that task only.
3. Run the planned verification command(s).
4. If verification passes, flip status from `~` to `x`.
5. If verification fails, stop blind retries and run backprop analysis.

## Failure → backprop

On test/build failure:

1. Read the failure output.
2. Classify cause with the user when needed:
   - code bug in current implementation
   - spec is wrong
   - edge case missing from spec
3. If it is only a code bug, fix code and rerun verification.
4. If spec is wrong or incomplete, use `cavekit-backprop` and `cavekit-spec` to update §B/§V/§T before resuming.

Never silently fix a root cause that should become spec memory.

## Write policy

- `cavekit-build` may flip §T status cells for chosen tasks.
- Other `SPEC.md` edits belong to `cavekit-spec`.
- Do not commit automatically. Commit only when the user explicitly asks in this session.
- Keep changes scoped to selected tasks.

## Completion criteria

A task can be marked `x` only when:

- planned verification exits 0, or the user explicitly accepts a documented reason verification cannot run;
- required tests or checks were added/updated where practical;
- touched §V invariants are not knowingly regressed;
- implementation matches cited §I surfaces.

## Non-goals

- No sub-agents by default.
- No parallel workers.
- No dashboards or managed state beyond `SPEC.md`.
- No speculative work outside selected task scope.
