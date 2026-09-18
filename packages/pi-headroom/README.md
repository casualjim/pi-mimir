# @casualjim/pi-headroom

Headroom context compression for **pi and omp** (side by side). Compresses
oversized tool results through a local
[Headroom](https://github.com/headroomlabs-ai/headroom) proxy and exposes a
`headroom_retrieve` tool so compressed originals stay recoverable.

Fork lineage: `@raquezha/noheadroom` → `@ryan_nookpi/pi-extension-headroom`
(Jonghakseo), MIT.

## Install

```bash
pi install /path/to/pi-mimir/packages/pi-headroom     # pi
omp plugin install /path/to/pi-mimir/packages/pi-headroom   # omp
```

Both hosts read the same source: the manifest declares `pi.extensions` and
`omp.extensions`, and omp's legacy-pi compat layer remaps `@earendil-works/*`
imports (plus `typebox`) onto its own packages.

Run a Headroom proxy yourself (never spawned by this package):

```bash
headroom proxy            # default port 8787
headroom proxy --port 8788   # custom port: also set baseUrl in this host's settings
```

The default `baseUrl` is `http://127.0.0.1:8787` — Headroom's own default. Running a
custom port (this setup uses 8788) means the settings file must set `baseUrl`, e.g.
`~/.pi/agent/headroom/settings.json` for pi and `~/.omp/agent/headroom/settings.json`
for omp: `{ "baseUrl": "http://127.0.0.1:8788" }` (or export `PI_HEADROOM_URL`).

## Settings

Resolved per host, first match wins:

| Order | Source |
|---|---|
| 1 | `PI_HEADROOM_SETTINGS` — exact settings file path |
| 2 | `PI_CODING_AGENT_DIR` → `<dir>/headroom/settings.json` |
| 3 | host default: `~/.omp/agent/headroom/settings.json` (omp) / `~/.pi/agent/headroom/settings.json` (pi) |

Keys: `baseUrl`, `enabled`, `mode`, `minContextTokens`, `minMessageChars`,
`timeoutMs`, `allowRemote`, `renameToolCalls`. `/headroom mode <m>` writes back
to the file the host resolved.

Host detection is a capability probe: omp's `ExtensionAPI` exposes `zod`, pi's
does not.

## Retrieve

Compressed results carry a hash marker, e.g.
`[400 items compressed to 10. Retrieve more: hash=abc…]` or `<<ccr:abc…>>`.
Call `headroom_retrieve(hash="abc…")` to get the full original from the
proxy's CCR store (TTL 1800 s).

`/headroom status|on|off|health|stats|mode <normal|quiet|silent>`

## Behavior

- Only `toolResult` content is mutated; user/assistant text, tool-call ids and
  names stay unchanged in the session.
- Tool calls are renamed to `pi_tool_result` in the compression payload so
  Headroom's `DEFAULT_EXCLUDE_TOOLS` does not skip large `read`/`grep` results.
  Set `renameToolCalls: false` to keep Headroom's intended read protection.
- Unset or unreachable proxy degrades to a no-op with a one-time warning.
- Loop guards: reentrancy flag, 3 s throttle, input/output/candidate
  fingerprints, bounded seen-content FIFO.

## Host compatibility

- `headroom_retrieve` declares `loadMode: "essential"` and `approval: "read"`.
  omp defaults extension tools to `discoverable` and `exec`, which would keep a
  marker-redeeming tool out of the top-level set and route it through the
  approval gate; pi ignores both fields.
- Default `timeoutMs` is 20 s. The compress call runs inside the `context`
  handler, and omp kills a handler at its 30 s per-event cap
  (`EXTENSION_HANDLER_TIMEOUT_MS`), which would drop the whole context
  transform. pi has no such cap.
- omp's handler context exposes no `AbortSignal`; a `ctx.signal` absence simply
  leaves the internal timeout as the only bound.
