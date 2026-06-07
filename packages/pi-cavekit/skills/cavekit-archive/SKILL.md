---
name: cavekit-archive
description: Archive old project-root SPEC.md content when file exceeds 500 lines. Copies full SPEC.md to .cavekit/archive/ before trimming completed tasks, old bugs, and uncited constraints/interfaces/invariants. Use when users invoke /ck:archive or ask to archive, trim, or compact Cavekit SPEC.md.
---

# cavekit-archive — compact SPEC.md

Archive long project-root `SPEC.md` files. Full copy first; trim working copy only after explicit user approval.

Read bundled `../../FORMAT.md` before interpreting or editing `SPEC.md`. The bundled file defines section order, pipe-table rules, archive comments, ID monotonicity, and caveman-style encoding.

## PRECHECK

1. Read project-root `SPEC.md`. If missing, report `no SPEC.md, nothing to archive` and stop.
2. Count lines. If `SPEC.md` has `≤500` lines, report `SPEC.md is <N> lines. Nothing to archive.` and stop with no writes.
3. Read bundled `../../FORMAT.md` if not already loaded.
4. Determine target archive path: `.cavekit/archive/SPEC-<YYYY-MM-DD>.md`; if it exists, use `-2`, `-3`, etc.

## DRY-RUN PREVIEW — no writes

Analyze `SPEC.md`. Do not create directories, archive files, or edit `SPEC.md` during preview.

Compute:

1. `lines before` = total line count.
2. §T candidates: rows with status `x`; list IDs/ranges and line count.
3. §B candidates: rows whose `date` is older than 90 days; list IDs/ranges and line count.
4. Active cites: collect `cites` cells from §T rows with status `.` or `~`.
5. §V candidates: `V<n>` lines not cited by active §T; list IDs/ranges and line count.
6. §I candidates: interface items not cited by active §T; list refs and line count.
7. §C candidates: constraints not cited by active §T; list count and line count.
8. `lines after` = `lines before` minus removed candidate lines plus one archive comment per trimmed section.

Show preview:

```text
## archive preview

archive target: .cavekit/archive/SPEC-<YYYY-MM-DD>.md
§T would archive: T1, T3-T8, T12 (9 tasks completed)
§B would archive: B1-B4 (4 bugs older than 90 days)
§V would archive: V1,V3-V5 (4 invariants, no active task cites them)
§I would archive: I.cli (1 interface, no active task cites it)
§C would archive: 2 constraints, no active task cites them
§G untouched

lines before: 533
lines after: 100

Proceed? (yes / no / amend)
```

If user says `yes`, continue to ARCHIVE + TRIM.
If user says `no`, stop. Nothing written.
If user says `amend`, incorporate requested include/exclude changes and rerun dry-run preview.

## ARCHIVE

1. Create `.cavekit/archive/` if absent.
2. Copy exact full pre-trim `SPEC.md` to chosen archive path.
3. Do not normalize line endings, rewrite content, or modify the archive copy.
4. Only after archive copy succeeds, edit working `SPEC.md`.

## TRIM

Trim only working `SPEC.md`. Archive copy remains exact and untouched.

### §T — completed tasks

1. Remove rows with status `x`.
2. Preserve remaining `.` and `~` rows.
3. Insert archive comment above §T table header:

```text
<!-- archive: .cavekit/archive/SPEC-<date>.md §T T1-T12 -->
```

### §B — old bugs

1. Remove §B rows older than 90 days.
2. Preserve recent rows.
3. Insert archive comment above §B table header:

```text
<!-- archive: .cavekit/archive/SPEC-<date>.md §B B1-B5 -->
```

### §V — uncited invariants

1. Collect live `V<n>` refs from active §T rows only (`.` or `~`).
2. Remove `V<n>` lines not in live set.
3. Insert archive comment above §V archived range:

```text
<!-- archive: .cavekit/archive/SPEC-<date>.md §V V1,V3-V5 -->
```

### §I — uncited interfaces

1. Collect live `I.*` refs from active §T rows only (`.` or `~`).
2. Remove §I items not in live set.
3. Insert archive comment above §I archived range:

```text
<!-- archive: .cavekit/archive/SPEC-<date>.md §I I.api,I.cli -->
```

### §C — uncited constraints

1. Collect live §C refs from active §T rows only (`.` or `~`).
2. Remove §C bullets not in live set.
3. Insert archive comment above §C archived range:

```text
<!-- archive: .cavekit/archive/SPEC-<date>.md §C -->
```

### §G — never touched

Do not edit §G.

## REPORT

After writes, show changed path, archive path, and diff summary:

```text
## archive report

saved to: .cavekit/archive/SPEC-2026-05-15.md

§T archived: T1, T3-T8, T12 (9 tasks completed)
§B archived: B1-B4 (4 bugs older than 90 days)
§V archived: V1,V3-V5 (4 invariants, no active task cites them)
§I archived: I.cli (1 interface, no active task cites it)
§C archived: 2 constraints
§G untouched

lines before: 542
lines after: 218
```

## RULES

- Archive = exact full pre-trim copy. Content loss ⊥.
- No writes before dry-run preview and explicit user OK.
- Missing `SPEC.md` or `≤500` lines → no write.
- One archive file per run. If same-day archive exists, suffix `-2`, `-3`, etc.
- §G never removed or changed.
- §T removes only completed rows (`x`).
- §B removes only rows older than 90 days.
- §C, §I, and §V remove only items uncited by active §T (`.` or `~`).
- Archive comments must include archive path, section, and ranges/refs when applicable.
- After archive, cavekit-spec/build/check must resolve IDs/cites from current tables plus archive comments and archived `SPEC.md` copies. Never reuse IDs.
- Do not commit unless user explicitly asks in this session.
