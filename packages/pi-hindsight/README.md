# pi-hindsight

Pi extension **plus a dist patcher** for [hindsight-coding-agents](https://github.com/vectorize-io/hindsight/tree/main/hindsight-integrations/coding-agents). Both add the one thing upstream lacks: **template-aware recall/reflect tags** (`{gitProjectLower}` etc.), so one shared bank can serve per-project filtering + an untagged global layer — the model oh-my-pi's `per-project-tagged` scoping uses.

- `extensions/hindsight/` — pi-only wrapper: loads the stock dist, adds recall/reflect tags for pi sessions
- `patch-dist.mjs` — patches the stock dist **in place**, so every harness (pi, claude, codex, cursor, copilot, opencode, cline, kilo, hooks, mcp-server, …) gets the same features

Use either; the patch is the belt-and-braces option that covers all agents. (If both are active, the wrapper's fetch layer is a no-op — the patched client already sends tags.)

## Why

The official plugin resolves `{gitProject}`-style templates only for `bankIdTemplate`, `retainTags` and `retainMetadata`. Recall and reflect ship **without tags**, so a shared bank setup (one bank, per-project tags + untagged global memories — the model oh-my-pi's `per-project-tagged` scoping uses) degrades for pi: every session recalls every project's memories.

This wrapper adds two config keys and closes the gap:

- `recallTags` — template-aware tags baked into recall requests
- `recallTagsMatch` — `any` (default; own project + untagged globals) | `any_strict` | `all` | `all_strict`

Same tags are also injected into `/reflect` request bodies via a fetch wrapper.

## Patch all coding agents (recommended)

```bash
node packages/pi-hindsight/patch-dist.mjs                 # patch ~/.hindsight/coding-agents/dist in place
node packages/pi-hindsight/patch-dist.mjs --restore       # undo (originals kept as *.orig-pirecalltags)
```

- Originals backed up once per file; `node --check` verifies every write (failures auto-revert)
- Idempotent — safe to re-run any time, including after `hindsight-coding-agents update` (which overwrites the dist)
- Same config keys as below; the patched bundles resolve `recallTags`/`recallTagsMatch` themselves, including for claude/codex/… hooks

## Config

Reads the same file the official plugin uses (`HINDSIGHT_CONFIG` or `~/.hindsight/coding-agent.json`), as a superset:

```json
{
  "bankId": "omp",
  "retainTags": ["project:{gitProjectLower}"],
  "recallTags": ["project:{gitProjectLower}"],
  "recallTagsMatch": "any",
  "autoInject": "reflect"
}
```

Template placeholders: `{gitProject}` (basename of the repo's main worktree root), `{gitProjectLower}` (same, lowercased — matches oh-my-pi's `project:<name>` tags), `{project}`, `{harness}`, `{channel}`, `{user}`.

> Use lowercase repo directory names, or `{gitProjectLower}` everywhere, so pi and oh-my-pi write the same `project:<name>` tag. Tags are matched literally by the server.

If you set `HINDSIGHT_CONFIG` yourself, it is used verbatim (no `recallTags` processing) — explicit user config wins.

The wrapper writes a generated config (wrapper keys stripped, `recallOptions` baked) to `~/.hindsight/pi-hindsight/<project>.json` and points `HINDSIGHT_CONFIG` at it for this process only. Your original config is never modified.

If `recallOptions.tags` is set explicitly, it wins over `recallTags` and a warning is printed.

## Compatibility

Checked at every load, with loud warnings on mismatch:

- official dist present at `~/.hindsight/coding-agents/dist/pi.js` (override with `HINDSIGHT_PI_DIST`)
- exports the default extension factory
- version in the tested range (`>=0.7`)

If the export shape ever changes upstream, the extension loads nothing rather than misbehaving — tag injection only happens when the factory is healthy.

## Install

```bash
pnpm install
npx tsc --noEmit && npx vitest run   # from packages/pi-hindsight
```

Point pi at it in `~/.pi/agent/settings.json`:

```json
"extensions": ["/Users/ivan/github/casualjim/pi-mimir/packages/pi-hindsight/extensions/hindsight/index.ts"]
```

(replaces the official `/Users/ivan/.hindsight/coding-agents/dist/pi.js` entry — keep the official package installed; this wrapper imports it).

## Development

```bash
npx vitest run        # unit tests (core is pure, no pi imports)
npx tsc --noEmit      # typecheck
```
