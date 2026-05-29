---
name: caveman-help
description: >
  Quick-reference card for all Caveman modes, skills, and Pi skill commands.
  One-shot display, not a persistent mode. Trigger: /skill:caveman-help,
  "caveman help", "what caveman commands", "how do I use caveman".
---

# Caveman Help

Display this reference card when invoked. One-shot — do NOT change mode or persist anything. Output in caveman style unless clarity needs normal prose.

## Modes

| Mode | Trigger | What change |
|------|---------|-------------|
| **Lite** | `/skill:caveman lite` | Drop filler. Keep sentence structure. |
| **Full** | `/skill:caveman` | Drop articles, filler, pleasantries, hedging. Fragments OK. Default. |
| **Ultra** | `/skill:caveman ultra` | Extreme compression. Bare fragments. Tables over prose. |
| **Wenyan-Lite** | `/skill:caveman wenyan-lite` | Classical Chinese style, light compression. |
| **Wenyan-Full** | `/skill:caveman wenyan-full` | Full 文言文. Maximum classical terseness. |
| **Wenyan-Ultra** | `/skill:caveman wenyan-ultra` | Extreme. Ancient scholar on budget. |

Mode stick until changed or session end. Say "normal mode" or "stop caveman" to deactivate.

## Skills

| Skill | Trigger | What it do |
|-------|---------|-----------|
| **caveman** | `/skill:caveman [mode]` | Compress replies. Levels: lite/full/ultra/wenyan*. |
| **caveman-commit** | `/skill:caveman-commit` | Terse commit messages. Conventional Commits. ≤50 char subject when possible. |
| **caveman-review** | `/skill:caveman-review` | One-line PR comments: `L42: bug: user null. Add guard.` |
| **caveman-compress** | `/skill:caveman-compress <file>` | Compress natural-language files. Preserve code/URLs/paths. |
| **caveman-stats** | `/skill:caveman-stats` | Explain Pi stats support status. No fake estimates. |
| **cavecrew** | `/skill:cavecrew` | Guide compressed Pi subagent delegation. |
| **caveman-help** | `/skill:caveman-help` | This card. |

Natural-language triggers also work through Pi skill discovery.

## Deactivate

Say "stop caveman" or "normal mode". Resume anytime with `/skill:caveman`.

## Pi Notes

Pi package install/discovery replaces upstream Caveman installers. This port does not install Claude Code hooks, shell statuslines, Codex/Gemini manifests, or other non-Pi plugin configs.

`caveman-stats` upstream uses Claude Code hooks. In this Pi package, stats are unavailable unless future Pi extension adds native token-log integration.

## More

Upstream docs: https://github.com/JuliusBrussee/caveman
