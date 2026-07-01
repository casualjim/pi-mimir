# SPEC

## §G GOAL
Pi workflow monorepo → review-gated OpenSpec planning/implementation, standalone Codex-style code review, codebase-memory support, forked advisor, Cavekit/Caveman/Pi Grill/Heimdall packages.

## §C CONSTRAINTS
- pnpm primary package manager; workspace `packages/*`; packages ESM; tests Vitest; typecheck `tsc --noEmit`.
- pnpm lockfile/workspace metadata ! source of dependency truth; npm lockfiles ⊥ unless explicit compatibility artifact.
- Pi package metadata ! source of install surface: `pi.extensions`, `pi.skills`, `pi.prompts`, `files`.
- `@casualjim/pi-mimir` bundled skills ! package/plugin-backed; OpenSpec role agents sync to `~/.pi/agent/agents` with `~/.pi/agent/mimir-managed.json`; project `.pi/agents` copy ⊥.
- `@casualjim/pi-mimir` owns OpenSpec workflow orchestration; ! commit/push/PR/archive/finishing branch.
- Full `@casualjim/pi-mimir` discovery requires separate `@casualjim/pi-codebase-memory`; unavailable tools → degraded discovery warning.
- OpenSpec state lives under `openspec/`; review-gated schema ! valid OpenSpec `name/version/description/artifacts/apply` shape.
- Managed assets content-addressed; user-modified managed files ! overwritten silently.
- `pi-cavekit` skills/prompts only; bundles `FORMAT.md`; no extension, hooks, installer, managed config, `pi-caveman` dep; `cavecrew-investigator` ? optional read-only delegation.
- upstream cavekit v4.1 verbs ! ported with Pi plugin path mapping: skill `<verb>` → `cavekit-<verb>`; skill dir `skills/<verb>/SKILL.md` → `skills/cavekit-<verb>/SKILL.md`; repo-root `FORMAT.md` ref → bundled `../../FORMAT.md`; command `/ck:<verb>` names kept; internal cross-skill path literals rewritten to `cavekit-<verb>`.
- cavekit `§R RESEARCH` optional; `SPEC.md` sectioned ownership — each verb writes only owned sections, `cavekit-spec` sole general mutator; right-size rule (ceremony scales to blast radius).
- `pi-caveman` ships Pi-native extension hooks equivalent to upstream Claude `SessionStart`/`UserPromptSubmit`; no `~/.claude` mutation or non-Pi plugin install; Cavecrew agents ! Pi-subagents executable when package installed; use is skill/workflow-steered, not hook-auto-spawned.
- `advisor` off by default; configured model/effort persisted; child lane read-only; output only `PLAN`/`CORRECTION`/`STOP`.
- `@casualjim/pi-review` standalone; OpenSpec integration/dependency ⊥; `/review` behavior mirrors Codex `/review` task.
- `@casualjim/pi-grill-me` ! use project-root `SPEC.md` as only durable truth doc; `SPEC.md` mutation ! route through `cavekit-spec`; direct grill edit of `SPEC.md` ⊥; `CONTEXT.md`/`CONTEXT-MAP.md` target ⊥; existing context files read-only legacy sources; ? soft-use `cavecrew-investigator`; hard `pi-caveman` dep ⊥.
- `@casualjim/pi-heimdall` in monorepo ! normalized workspace package, not raw standalone repo copy; repo-local artifacts (`node_modules/`, `.pi/`, `openspec/`, research/plan scratch docs) ⊥.

## §I INTERFACES
- pkg: `@casualjim/pi-mimir` → extension `extensions/openspec`, package skills `skillseeds/`, package agents `agents/`, project state `openspec/`.
- cmd: `/openspec:init` → run `openspec init --tools pi`, force `openspec/config.yaml` schema `review-gated`, sync OpenSpec schemas/project state only, report codebase-memory status.
- cmd: `/openspec:update` → run `openspec update`, refresh review-gated config/OpenSpec assets only, report setup status.
- cmd: `/openspec:status`, `/openspec:list` → proxy `openspec view/list` output through custom renderer.
- skill: `plan`, `implement`, `review-plan` exposed by `@casualjim/pi-openspec`; copied into `.pi/skills` ⊥; implementation review handoff uses standalone `@casualjim/pi-review` when installed.
- skill: `review-implementation`, `review-architecture`, `review-tests`, `review-data-flow`, `review-security` exposed by `@casualjim/pi-review` from package `skills/`; copied into `.pi/skills` ⊥; implementation/specialist reviews accept explicit non-OpenSpec scope + optional OpenSpec artifacts.
- agent: `@casualjim/pi-mimir` bundled `agents/*` synced into `~/.pi/agent/agents`; ownership tracked in `~/.pi/agent/mimir-managed.json`; copied into project `.pi/agents` ⊥.
- pkg: `@casualjim/pi-codebase-memory` → extension `extensions/codebase-memory`, skill `codebase-memory`, dep `codebase-memory-mcp`.
- file: `~/.pi/agent/mcp.json` → `codebase-memory-mcp` server with `directTools: true` when absent.
- pkg: `@casualjim/pi-review` → extension `extensions/review`, command `/review`, bundled Codex review prompt, whole-tree implementation review skills, standalone review workflow.
- cmd: `/review` → review staged/unstaged/untracked/uncommitted changes; use codebase-memory-first exploration then exact diff/file reads; emit structured findings; edit/git/comment ⊥.
- cmd: `/review --base <branch>` → find merge-base with `<branch>`, inspect `git diff <merge-base>`, emit structured findings.
- cmd: `/review --commit <sha>` → inspect changes from commit `<sha>`, emit structured findings.
- cmd: `/review --custom <instructions>` → use non-empty custom review prompt, emit structured findings.
- agent: `@casualjim/pi-review` bundled `agents/implementation-reviewer.md` synced into `~/.pi/agent/agents`; ownership tracked in `~/.pi/agent/pi-review-managed.json`.
- pkg: `@casualjim/pi-advisor` → extension `extensions/advisor`, command `/advisor`, tool `advisor`, packaged agent `advisor-child.md`; copied agent file ⊥.
- pkg: `@casualjim/pi-heimdall` → extension `extensions/heimdall.ts`, optional `extensions/heimdall-bg-tasks.ts`, libs under `lib/`, tests under `tests/`; package workspace files only.
- file: `.pi/heimdall.jsonc` → `commandPolicies[]` policy `bare: true` ! enforce matched command run bare: ⊥ pipe (`|`) & redirect (`>`/`>>`/`<`/`>&`/`<&`/`>|`/`&>`/`&>>`/`<<<`) ops.
- file: `.pi/advisor-managed.json` → legacy advisor copied-agent manifest; read/prune only; new writes ⊥.
- pkg: `@casualjim/pi-cavekit` → skills `cavekit-spec`, `cavekit-build`, `cavekit-check`, `cavekit-backprop`, `cavekit-archive`, `cavekit-grill`, `cavekit-research`, `cavekit-review`, `cavekit-deepen`; prompts `/ck:spec`, `/ck:build`, `/ck:check`, `/ck:archive`, `/ck:grill`, `/ck:research`, `/ck:review`, `/ck:deepen`; file `FORMAT.md`; ? soft-use `cavecrew-investigator` for read-only code archaeology when available.
- cmd: `/ck:grill` → interrogate fuzzy idea into `§G`/`§C` before spec; one question at a time, recommend answer, hand off to `cavekit-spec`; ⊥ write `SPEC.md`.
- cmd: `/ck:research` → gather external knowledge into `§R`; every finding cites source, unverified flagged `?`; hand rows to `cavekit-spec`.
- cmd: `/ck:review` → adversarial senior review of spec before build; refute not rubber-stamp; draft `§V` for HARDEN; end GO/NO-GO gate; hand to `cavekit-spec`.
- cmd: `/ck:deepen` → spare-budget design pass; pick one shallow module, propose deeper `§I`/`§V`/`§T`; behavior held, tests green before & after; hand to `cavekit-spec`.
- file: project-root `SPEC.md` → Cavekit single durable spec artifact; optional `§R RESEARCH` section `id|topic|finding|src`.
- file: `.cavekit/archive/SPEC-<YYYY-MM-DD>[-2|-3|...].md` → exact pre-trim `SPEC.md` copy; archive comments in working spec link archived ranges.
- file: `package.json` → pnpm `packageManager`, workspace scripts use pnpm recursion.
- file: `pnpm-workspace.yaml` → workspace packages `packages/*`.
- file: `pnpm-lock.yaml` → dependency lock source of truth; `package-lock.json` ⊥.
- pkg: `@casualjim/pi-caveman` → extension `extensions/caveman`, skills `caveman`, `caveman-commit`, `caveman-review`, `caveman-compress`, `caveman-help`, `caveman-stats`, `cavecrew`; agents `cavecrew-*`.
- skill: `cavecrew` → decision guide for explicit subagent delegation via `subagent` tool; must list available agents before execution; no automatic agent spawning by extension hooks.
- agent: `cavecrew-investigator` → Pi-subagents executable read-only locator; codebase-memory tools first, exact reads/shell fallback; no fixes/design.
- agent: `cavecrew-builder` → Pi-subagents executable surgical 1-2 file editor; Pi tools `read`/`edit`/`write`; no shell/git/destructive ops.
- agent: `cavecrew-reviewer` → Pi-subagents executable diff/file reviewer; Pi tools `read`/`bash`; bash limited to non-mutating diff/log/show.
- file: `~/.pi/agent/caveman-managed.json` → `@casualjim/pi-caveman` user-agent ownership manifest for synced Cavecrew agents.
- pkg: `@casualjim/pi-grill-me` → skill `grill-with-docs`; project-root `SPEC.md` canonical; all `SPEC.md` creation/amendment through `cavekit-spec`; legacy `CONTEXT.md`/`CONTEXT-MAP.md` read-only import input; ? delegate codebase fact-finding to `cavecrew-investigator` when available, else use own codebase-memory ladder.
- hook: `pi-caveman` session start → load default mode, write safe mode flag, inject filtered `skills/caveman/SKILL.md` rules.
- hook: `pi-caveman` Pi equivalent of `UserPromptSubmit` ? → track `/skill:caveman`/natural-language mode changes and inject active-mode reminder.
- file: Pi caveman mode state path ? → valid modes only; symlink/oversize/corrupt reads ignored.
- file: `.pi/mimir-managed.json` → OpenSpec project-state asset manifest only; packaged skills omitted; legacy project copied agent entries read/prune only.
- file: `~/.pi/agent/mimir-managed.json` → `@casualjim/pi-mimir` user-agent ownership manifest for synced OpenSpec role agents.

## §V INVARIANTS
V1: package registration ! match intended Pi surface; no hidden public skills/prompts/extensions.
V2: install/package files ! include required assets; ! include active upstream installers/hooks/plugin manifests when port says excluded.
V3: managed sync ! content-hash tracked; unchanged managed files auto-update/remove; user-modified files stay user-owned.
V4: `review-gated` schema ! accepted OpenSpec shape; artifact deps proposal → specs/design → tasks → apply.
V5: `plan`/`implement` ! use OpenSpec artifacts as source; implementation stops before archive and git mutation.
V6: codebase-memory readiness ! capability-based; missing tools report exact `pi install @casualjim/pi-codebase-memory` and degraded discovery.
V7: codebase-memory plugin ! configure MCP only when missing; malformed config preserved with warning.
V8: advisor ! inactive until configured; missing config/API/session prerequisites return structured failure, not silent no-op.
V9: advisor child ! fork parent context, read-only tools, no recursive advisor, response ∈ `PLAN`/`CORRECTION`/`STOP`.
V10: Cavekit `SPEC.md` writes ! follow bundled `FORMAT.md`; §T status ∈ `.`, `~`, `x`; table `|` escaped.
V11: Cavekit package ! independent of `pi-caveman`; `FORMAT.md` reference bundled and prompts route to `cavekit-*` skills; `cavecrew-investigator` ? optional soft read-only delegation; no hard dep.
V12: Caveman package ! preserve Pi-native terse skills; stats limitation honest until Pi token-log extension exists.
V13: `pi-caveman` ! activate Caveman on Pi session start; rules from `skills/caveman/SKILL.md`, filtered by mode; `off` → no injection.
V14: mode state ! valid mode enum only, symlink-safe write/read, size-bounded; corrupted state → no injection.
V15: per-turn hook ! reinforce active Caveman; track `/skill:caveman*`, natural-language enable/disable, `stop caveman`, `normal mode`; independent modes `commit`/`review`/`compress` skip base reply rules.
V16: Pi port ! mimic upstream Claude `SessionStart`/`UserPromptSubmit` behavior without installing Claude hooks, editing `~/.claude`, or shipping active non-Pi plugin manifests.
V17: `@casualjim/pi-mimir` bundled skills ! resolve from installed package catalog; `@casualjim/pi-mimir` role agents ! sync to `~/.pi/agent/agents`; new copies under project `.pi/agents`/`.pi/skills` ⊥.
V18: `@casualjim/pi-review` `review-implementation` + specialist review skills ! accept explicit review scope without `openspec/changes/...`; OpenSpec artifacts ? context only when supplied; whole-tree review ! not changed-line-limited.
V19: `@casualjim/pi-review` ! standalone Codex-style `/review` + implementation review skills; no `pi-openspec` deps, imports, or workflow coupling.
V20: `/review` targets ! support uncommitted changes, base branch, commit SHA, custom instructions; empty custom/branch/SHA rejected.
V21: `/review` prompt ! port Codex `core/review_prompt.md` semantics: actionable bugs only, all findings, priorities P0-P3, shortest diff-overlap line ranges, no PR fix.
V22: `/review` output ! readable `cavecrew-reviewer` findings; preserve Codex bug-selection, priority, diff-overlap line-range semantics; raw ReviewOutput JSON ⊥.
V23: `pi-review` discovery ! codebase-memory ladder first when tools available; stale/unavailable graph → degraded discovery stated; exact diff/file reads allowed.
V24: `cavecrew-investigator` ! expose codebase-memory tools + `read`/`bash` fallback; read-only; compressed file:line output; fixes/design ⊥.
V25: `grill-with-docs` ! treat project-root `SPEC.md` as canonical; all `SPEC.md` mutations ! go through `cavekit-spec`; direct `SPEC.md` edit by grill ⊥; `CONTEXT.md`/`CONTEXT-MAP.md` read-only legacy input, never target; may use `cavecrew-investigator` for codebase facts when available; no hard `pi-caveman` dep; unavailable agent → normal codebase-memory fallback.
V26: `pi-caveman` Cavecrew ! remain explicit skill/agent delegation; extension hooks only manage Caveman mode state/injection, ⊥ auto-spawn subagents.
V27: Cavecrew agent files ! Pi-subagents-compatible frontmatter/tool names; synced to `~/.pi/agent/agents` with content-hash manifest; user-modified agents preserved; Claude tool names `Read/Grep/Glob/Bash/Edit/Write` ⊥.
V28: `packages/pi-heimdall` ! contain only workspace package source/tests/docs needed for package; copied standalone repo artifacts (`node_modules/`, `.pi/`, `openspec/`, `fnox.toml`, research/plan scratch docs, standalone lockfiles) ⊥.
V29: workspace dependency state ! pnpm-owned: `packageManager` pins pnpm, `pnpm-workspace.yaml` declares packages, `pnpm-lock.yaml` exists, npm lockfiles ⊥.
V30: workspace scripts/docs/CI ! prefer pnpm commands; npm commands only explicit compatibility notes.
V31: `caveman-compress` ! Pi-native: helper/model calls route through Pi CLI/config; Anthropic SDK, `claude --print`, provider-specific auth/env assumptions ⊥.
V32: `/review` cavecrew prompt ! include Codex bug rules, ⊥ include Codex JSON output schema; severity map P0/P1→🔴, P2→🟡, P3→🔵.
V33: `cavekit-archive` ! copy exact full `SPEC.md` to `.cavekit/archive/SPEC-<YYYY-MM-DD>[-2|-3|...].md` before trim; content loss ⊥.
V34: `cavekit-archive` ! dry-run preview + explicit user OK before writes; missing `SPEC.md` or ≤500 lines → no write.
V35: archive trim ! remove only completed §T, §B older than 90 days, and §C/§I/§V uncited by active §T; §G untouched; comments preserve ranges; new IDs continue max(current+archived).
V36: ported cavekit verbs ! rewrite upstream internal refs (`skills/<verb>/SKILL.md`, repo-root `FORMAT.md`) to Pi plugin layout (`cavekit-<verb>`, bundled `../../FORMAT.md`); `/ck:<verb>` names kept; ⊥ leak upstream `skills/<verb>/SKILL.md` paths into packaged skills/prompts.
V37: cavekit `§R` writes & reach-for-verb handoffs (grill/research/review/deepen) ! route through `cavekit-spec`; verbs propose handoff blocks, ⊥ write `SPEC.md` directly; sectioned ownership honored — each verb touches only owned sections.
V38: bundled `packages/pi-cavekit/FORMAT.md` ! mirror upstream §R + sectioned-ownership + right-size sections; cavekit archive section preserved.
V39: command-policy-guard `bare` policy ! block matched command when its shell segment contains pipe (`|`) or redirect op; `bare` absent → unconditional block (current behavior preserved).

## §T TASKS
id|status|task|cites
T1|x|reconcile `openspec/changes/openspec-schema/tasks.md` unchecked rows with current corrected `review-gated` schema ?|V4
T2|x|validate workspace tests/typechecks after SPEC distill: `npm test --workspaces` ? plus package typechecks|V1,V2,V4,V8,V11,V12
T3|x|decide future Pi-native Caveman token stats extension or keep limitation permanent|V12
T4|x|decide supported archive/sync instruction surface for review-gated schema if post-apply lifecycle guidance needs durable hook ?|V4,V5
T5|x|confirm active OpenSpec changes all reflect code reality; archive or update stale completed changes ?|V4,V5
T6|x|port upstream Claude hook behavior from `~/github/JuliusBrussee/caveman/.claude-plugin/plugin.json` and `src/hooks/caveman-*` into Pi extension design|V13,V16
T7|x|add `packages/pi-caveman/extensions/caveman` and register `pi.extensions` while keeping skills/agents packaged|V1,V13
T8|x|impl session-start activation from `skills/caveman/SKILL.md`: default mode, `off`, filtered intensity rows, hidden context injection|V13
T9|x|impl safe mode state: valid enum, symlink-safe writes/reads, size cap, corrupt state ignored|V14
T10|x|impl Pi per-turn/UserPromptSubmit equivalent: track `/skill:caveman*`, natural-language enable/disable, `stop caveman`, `normal mode`, active reminder|V15,V16
T11|x|update `caveman-stats`/status docs: native Pi stats/statusline only if Pi APIs exist; no fake estimates|V12,V16
T12|x|add tests for extension registration, start injection, mode tracking, state safety, no `~/.claude` mutation, no non-Pi manifests|V1,V2,V13,V14,V15,V16
T13|x|update `packages/pi-caveman/README.md` to explain Pi-native hooks and remaining upstream-hook exclusions|V13,V16
T14|x|change `packages/pi-mimir` setup/update: expose packaged skills through plugin/package, sync role agents to `~/.pi/agent/agents`, stop project `.pi/skills`/`.pi/agents` bulk copy|V1,V2,V3,V17
T15|x|change `packages/advisor`: resolve `advisor-child.md` from package/plugin, stop `.pi/advisor-managed.json` new writes and copied agent files|V8,V9,V17
T16|x|add tests mirroring `rpiv-pi`/`rpiv-advisor`: installed package agents available, init/update/advisor leave no copied bundled agents/skills, legacy managed copies safe|V1,V2,V3,V8,V17
T17|x|change `review-architecture`, `review-tests`, `review-data-flow`, `review-security`: accept `<review-scope>`; OpenSpec artifacts optional; no mandatory `openspec/changes/...`|V18
T18|x|add contract/frontmatter tests: specialist review skills do not mandate OpenSpec and still require explicit review request + evidence-based findings|V1,V18
T19|x|scaffold `packages/pi-review` workspace package with `@casualjim/pi-review`, `pi.extensions`, packaged prompt assets, README, tests|V1,V2,V19
T20|x|port Codex `/review` target resolver + prompts: uncommitted, base branch merge-base diff, commit, custom|V20,V21
T21|x|impl `/review` command/subagent workflow: no edits, no git mutation, no GitHub comments, structured findings returned inline|V19,V21,V22
T22|x|add codebase-memory-first review discovery guidance with degraded fallback and exact diff/file-read path|V23
T23|x|add tests for command registration, target validation, prompt rendering, output schema, no `pi-openspec` coupling|V1,V19,V20,V21,V22,V23
T24|x|move `review-implementation` + specialist review skills and implementation reviewer agent into `packages/pi-review/skills`; update `pi-openspec` to planning review only|V1,V2,V18,V19,V23
T25|x|add codebase-memory tools + ladder to `packages/pi-caveman/agents/cavecrew-investigator.md` while preserving read-only compressed locator contract|V1,V2,V24
T26|x|update `packages/pi-grill-me/skills/engineering/grill-with-docs/SKILL.md` to soft-delegate codebase fact-finding to `cavecrew-investigator` when available, with fallback|V1,V25
T27|x|add optional `cavecrew-investigator` guidance to `cavekit-spec` DISTILL and `cavekit-check` evidence lookup; fallback to own codebase-memory/direct reads|V11,V24
T28|x|add optional `cavecrew-investigator` trace guidance to `cavekit-backprop`; keep spec mutation in `cavekit-spec`|V11,V24
T29|x|document/test Cavecrew explicit-delegation model: upstream Claude plugin hooks only mode tracking; Pi extension must not auto-spawn cavecrew agents|V1,V2,V16,V26
T30|x|sync `packages/pi-caveman/agents/cavecrew-*.md` into `~/.pi/agent/agents` with `~/.pi/agent/caveman-managed.json`; preserve user edits and remove stale managed agents|V1,V2,V3,V27
T31|x|convert Cavecrew agent frontmatter/instructions to Pi-subagents tool names and behavior: investigator codebase-memory-first, builder `read/edit/write`, reviewer non-mutating `read/bash`|V1,V24,V27
T32|x|update `cavecrew` skill instructions/tests to invoke Pi `subagent` tool correctly: list first, execute only available non-disabled agents, use `agent: "cavecrew-*"` task contracts|V1,V26,V27
T33|x|normalize `packages/pi-heimdall`: remove copied standalone repo artifacts, keep package source/tests/docs, update tests/package checks if needed|V1,V2,V28
T34|x|add pnpm workspace metadata: root `packageManager`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`; remove `package-lock.json` if no compatibility need|V29
T35|x|convert root workspace scripts/docs/CI from `npm --workspaces` to pnpm recursive equivalents|V30
T36|x|verify pnpm install/test/typecheck/pack across workspace with new lockfile|V2,V29,V30
T37|x|make `caveman-compress` workflow Pi-native: helper uses Pi CLI/model call + backup/validate loop; skill fallback uses Pi file tools|V31
T38|x|replace `ANTHROPIC_API_KEY`, `anthropic`, `claude --print`, and Claude wording in helper/docs/security with Pi CLI/provider-neutral behavior|V2,V16,V31
T39|x|add tests for `caveman-compress` Pi-native default: Pi CLI call path, no Claude/Anthropic assumptions, backup safety, protected code/inline/path/URL preservation|V1,V2,V31
T40|x|strip Codex `OUTPUT FORMAT`/JSON schema before `/review` cavecrew delegation; add severity map + tests for no prompt/agent conflict|V22,V32
T41|x|make `pi-grill-me` always target project-root `SPEC.md`; demote `CONTEXT.md`/`CONTEXT-MAP.md` to read-only legacy source|V25
T42|x|route all `pi-grill-me` `SPEC.md` creation/amendment through `cavekit-spec`; forbid direct grill edits|V25
T43|x|port upstream Cavekit archive surface: add `cavekit-archive` skill + `/ck:archive` prompt + package registration/docs|V1,V2,V10,V11,V33,V34
T44|x|update bundled `packages/pi-cavekit/FORMAT.md` archive section + ID lookup rules; keep Pi command names consistent|V10,V33,V34,V35
T45|x|teach `cavekit-spec`/`cavekit-build`/`cavekit-check` to parse archive comments and archived `SPEC.md` copies when resolving max IDs/cites|V10,V33,V35
T46|x|add tests for archive no-write precheck, dry-run approval, full-copy before trim, trim rules, archived-ID monotonicity, package prompt/skill surface|V1,V2,V10,V33,V34,V35
T47|x|port upstream cavekit `grill`/`research`/`review`/`deepen` skills into `packages/pi-cavekit/skills/cavekit-<verb>` with Pi path adaptation (`cavekit-<verb>` names, `../../FORMAT.md`, no `skills/<verb>/SKILL.md` literals)|V1,V2,V36
T48|x|add `/ck:grill`/`/ck:research`/`/ck:review`/`/ck:deepen` prompts mirroring existing `ck:*` prompt shape (`Use the cavekit-<verb> skill workflow`)|V1,V36
T49|x|sync bundled `packages/pi-cavekit/FORMAT.md` with upstream §R RESEARCH + sectioned ownership + right-size; preserve cavekit archive section & ID-lookup rules|V10,V33,V34,V35,V38
T50|x|teach `cavekit-spec`/`cavekit-check`/`cavekit-build` to handle optional §R + sectioned-ownership handoffs (grill §G/§C, research §R, review §V, deepen §I/§V/§T)|V10,V37,V38
T51|x|update §I cavekit interface line + package registration (`pi.skills`/`pi.prompts` auto-cover new dirs) + README for new skills/prompts|V1,V2,V36
T52|x|add tests: no upstream `skills/<verb>/SKILL.md` path leak, §R routes through `cavekit-spec`, sectioned ownership, new prompt/skill surface registered|V1,V2,V10,V36,V37
T53|x|extend `CommandPolicy` + `command-policy-guard` with `bare` requirement: block matched cmd when segment has pipe/redirect; add tests + README docs|V39

## §B BUGS
id|date|cause|fix
B1|2026-06-03|`caveman-compress` helper defaulted to Anthropic SDK/`claude --print`, breaking Pi-native package behavior|V31
B2|2026-06-03|`pi-review` copied Codex JSON prompt but not Codex parse/render review-mode path ∴ `/review` shows raw JSON|V32
B3|2026-06-04|`pi-grill-me` used `CONTEXT.md` as separate truth doc, conflicting with Cavekit `SPEC.md`|V25
B4|2026-06-04|`pi-grill-me` prompt allowed direct `SPEC.md` edits, bypassing sole mutator `cavekit-spec`|V25
