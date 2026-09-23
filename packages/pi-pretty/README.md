# @casualjim/pi-pretty

Fork of [@heyhuynhgiabuu/pi-pretty](https://github.com/heyhuynhgiabuu/pi-pretty)
(MIT) trimmed to the display tools it owns.

## What it does

Shiki-highlighted `read` previews, `ls` tree views with file-type icons,
FFF-accelerated `find`/`grep`, a prompt editor, and activity indicators.

## Bash

pi-pretty does not render, register, or substitute `bash`. That tool belongs to
pi-heimdall (sandboxed execute), and each host renders bash with its own
renderer: Pi's native bash definition carries `renderCall`/`renderResult`, and
Oh My Pi attaches its own from `@oh-my-pi/pi-tui/tools`.

Since pi 0.87.1, two extensions registering the same tool or flag is a hard
load error, so heimdall owns `bash` and the `--no-sandbox` flag, and pi-pretty
never touches either. Load order does not matter.

## Install

```bash
pi install git:github.com/casualjim/pi-mimir#subdirectory=packages/pi-pretty
```

Do not load upstream `@heyhuynhgiabuu/pi-pretty` at the same time as this fork.

## Sandbox resolution

Entirely pi-heimdall's concern: config levels
(`~/.config/heimdall/default.jsonc`, `~/.config/heimdall/config.jsonc`,
`<repo>/.config/heimdall.json`), the `--no-sandbox` flag, and binary
resolution all live there. See the
[pi-heimdall README](https://github.com/casualjim/pi-mimir/tree/main/packages/pi-heimdall).