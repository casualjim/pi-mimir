# SPEC

## §G GOAL
Pi workflow monorepo → review-gated OpenSpec planning/implementation, codebase-memory support, forked advisor, Cavekit/Caveman Pi packages.

## §C CONSTRAINTS
- npm workspaces `packages/*`; packages ESM; tests Vitest; typecheck `tsc --noEmit`.
- Pi package metadata ! source of install surface: `pi.extensions`, `pi.skills`, `pi.prompts`, `files`.
- `pi-mimir`/`advisor` bundled agents/skills ! package/plugin-backed; `.pi/agents`/`.pi/skills` bulk copy ⊥.
- `pi-mimir` owns OpenSpec workflow orchestration; ! commit/push/PR/archive/finishing branch.
- Full `pi-mimir` discovery requires separate `@casualjim/pi-codebase-memory`; unavailable tools → degraded discovery warning.
- OpenSpec state lives under `openspec/`; review-gated schema ! valid OpenSpec `name/version/description/artifacts/apply` shape.
- Managed assets content-addressed; user-modified managed files ! overwritten silently.
- `pi-cavekit` skills/prompts only; bundles `FORMAT.md`; no extension, hooks, installer, managed config, `pi-caveman` dep.
- `pi-caveman` ships Pi-native extension hooks equivalent to upstream Claude `SessionStart`/`UserPromptSubmit`; no `~/.claude` mutation or non-Pi plugin install.
- `advisor` off by default; configured model/effort persisted; child lane read-only; output only `PLAN`/`CORRECTION`/`STOP`.

## §I INTERFACES
- pkg: `pi-mimir` → extension `extensions/openspec`, package skills `skillseeds/`, package agents `agents/`, project state `openspec/`.
- cmd: `/openspec:init` → run `openspec init --tools pi`, force `openspec/config.yaml` schema `review-gated`, sync OpenSpec schemas/project state only, report codebase-memory status.
- cmd: `/openspec:update` → run `openspec update`, refresh review-gated config/OpenSpec assets only, report setup status.
- cmd: `/openspec:status`, `/openspec:list` → proxy `openspec view/list` output through custom renderer.
- skill: `plan`, `implement`, `review-plan`, `review-implementation`, `review-architecture`, `review-tests`, `review-data-flow`, `review-security` exposed by `pi-mimir` package/plugin; copied into `.pi/skills` ⊥; implementation/specialist reviews accept explicit non-OpenSpec scope + optional OpenSpec artifacts.
- agent: `pi-mimir` bundled `agents/*` exposed by package/plugin catalog; copied into `.pi/agents` ⊥.
- pkg: `@casualjim/pi-codebase-memory` → extension `extensions/codebase-memory`, skill `codebase-memory`, dep `codebase-memory-mcp`.
- file: `~/.pi/agent/mcp.json` → `codebase-memory-mcp` server with `directTools: true` when absent.
- pkg: `@casualjim/pi-mimir-advisor` → extension `extensions/advisor`, command `/advisor`, tool `advisor`, packaged agent `advisor-child.md`; copied agent file ⊥.
- file: `.pi/advisor-managed.json` → legacy advisor copied-agent manifest; read/prune only; new writes ⊥.
- pkg: `@casualjim/pi-cavekit` → skills `cavekit-spec`, `cavekit-build`, `cavekit-check`, `cavekit-backprop`; prompts `/ck:spec`, `/ck:build`, `/ck:check`; file `FORMAT.md`.
- file: project-root `SPEC.md` → Cavekit single durable spec artifact.
- pkg: `@casualjim/pi-caveman` → extension `extensions/caveman`, skills `caveman`, `caveman-commit`, `caveman-review`, `caveman-compress`, `caveman-help`, `caveman-stats`, `cavecrew`; agents `cavecrew-*`.
- hook: `pi-caveman` session start → load default mode, write safe mode flag, inject filtered `skills/caveman/SKILL.md` rules.
- hook: `pi-caveman` Pi equivalent of `UserPromptSubmit` ? → track `/skill:caveman`/natural-language mode changes and inject active-mode reminder.
- file: Pi caveman mode state path ? → valid modes only; symlink/oversize/corrupt reads ignored.
- file: `.pi/mimir-managed.json` → OpenSpec project-state asset manifest only; packaged skills/agents omitted; legacy copied entries read/prune only.

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
V11: Cavekit package ! independent of `pi-caveman`; `FORMAT.md` reference bundled and prompts route to `cavekit-*` skills.
V12: Caveman package ! preserve Pi-native terse skills; stats limitation honest until Pi token-log extension exists.
V13: `pi-caveman` ! activate Caveman on Pi session start; rules from `skills/caveman/SKILL.md`, filtered by mode; `off` → no injection.
V14: mode state ! valid mode enum only, symlink-safe write/read, size-bounded; corrupted state → no injection.
V15: per-turn hook ! reinforce active Caveman; track `/skill:caveman*`, natural-language enable/disable, `stop caveman`, `normal mode`; independent modes `commit`/`review`/`compress` skip base reply rules.
V16: Pi port ! mimic upstream Claude `SessionStart`/`UserPromptSubmit` behavior without installing Claude hooks, editing `~/.claude`, or shipping active non-Pi plugin manifests.
V17: `pi-mimir`/`advisor` bundled agents/skills ! resolve from installed package/plugin catalogs; new copies under `.pi/agents`/`.pi/skills` ⊥.
V18: `review-implementation` + specialist review skills ! accept explicit review scope without `openspec/changes/...`; OpenSpec artifacts ? context only when supplied.

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
T14|x|change `packages/pi-mimir` setup/update: expose packaged skills/agents through plugin/package, stop `.pi/skills`/`.pi/agents` bulk copy|V1,V2,V3,V17
T15|x|change `packages/advisor`: resolve `advisor-child.md` from package/plugin, stop `.pi/advisor-managed.json` new writes and copied agent files|V8,V9,V17
T16|x|add tests mirroring `rpiv-pi`/`rpiv-advisor`: installed package agents available, init/update/advisor leave no copied bundled agents/skills, legacy managed copies safe|V1,V2,V3,V8,V17
T17|x|change `review-architecture`, `review-tests`, `review-data-flow`, `review-security`: accept `<review-scope>`; OpenSpec artifacts optional; no mandatory `openspec/changes/...`|V18
T18|x|add contract/frontmatter tests: specialist review skills do not mandate OpenSpec and still require explicit review request + evidence-based findings|V1,V18

## §B BUGS
id|date|cause|fix
