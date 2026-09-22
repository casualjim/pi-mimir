# @casualjim/pi-pretty

Fork of [@heyhuynhgiabuu/pi-pretty](https://github.com/heyhuynhgiabuu/pi-pretty)
(MIT) that composes with
[@casualjim/pi-heimdall](https://github.com/casualjim/pi-mimir/tree/main/packages/pi-heimdall):
pretty rendering AND the heimdall sandbox on the same `bash` tool.

## How they compose

Since pi 0.87.1, two extensions registering the same tool or flag is a hard
load error, so exactly one extension may own `bash`:

- **pi-heimdall** owns the `bash` tool (sandboxed execute via
  `@casualjim/heimdall-sandbox`) and the `--no-sandbox` flag.
- **pi-pretty** never registers `bash` or any flag. It exports its bash
  renderers from the `@casualjim/pi-pretty/bash-renderers` subpath, and
  pi-heimdall attaches them to its tool — so `bash` output keeps pi-pretty
  styling while executing through the sandbox.

Load order does not matter. All other pi-pretty features (shiki `read`
previews, `ls` icons, FFF-powered `find`/`grep`, working indicator, thinking
shimmer) are unchanged.

Trade-offs of heimdall owning `bash`:

- bash rows show no elapsed-time line (the sandboxed execute does not record
  pretty's timing metadata)
- pi-pretty's extra ripgrep prompt guidance for bash is gone; the tool keeps
  the host SDK's description and guidelines
- mid-session `/sandbox on|off` works — the toggle and the tool live in the
  same extension now

## Install

```bash
pi install git:github.com/casualjim/pi-mimir#subdirectory=packages/pi-heimdall
pi install git:github.com/casualjim/pi-mimir#subdirectory=packages/pi-pretty
```

Do not load upstream `@heyhuynhgiabuu/pi-pretty` at the same time as this fork.

## Sandbox resolution

Entirely pi-heimdall's concern: config levels
(`~/.config/heimdall/default.jsonc`, `~/.config/heimdall/config.jsonc`,
`<repo>/.config/heimdall.json`), the `--no-sandbox` flag, and binary
resolution all live there. See the
[pi-heimdall README](https://github.com/casualjim/pi-mimir/tree/main/packages/pi-heimdall).