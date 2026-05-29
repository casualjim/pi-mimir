<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/rock_1faa8.png" width="80" />
</p>

<h1 align="center">caveman-compress</h1>

<p align="center">
  <strong>shrink memory file. save token every session.</strong>
</p>

---

A Pi skill that compresses natural-language memory files (`AGENTS.md`, `CLAUDE.md`, todos, preferences, notes) into caveman format so future sessions load fewer tokens.

The skill preserves code blocks, inline code, URLs, commands, file paths, headings, tables, dates, versions, and technical names. It writes a `<filename>.original.md` backup before overwriting the input file.

## What It Do

```text
/skill:caveman-compress AGENTS.md
```

```text
AGENTS.md          ← compressed
AGENTS.original.md ← human-readable backup
```

Original never lost. You can read and edit `.original.md`. Run skill again to re-compress after edits.

## Install

Install this Pi package, then invoke the skill through Pi:

```text
pi install @casualjim/pi-caveman
/skill:caveman-compress <filepath>
```

For local development:

```text
pi install ./packages/pi-caveman
```

**Requires for bundled helper:** Python 3.10+. The helper may use `ANTHROPIC_API_KEY`, the optional `anthropic` Python package, or an existing `claude` CLI. This Pi package does not install those dependencies or authenticate external services.

## Usage

```text
/skill:caveman-compress <filepath>
```

Examples:

```text
/skill:caveman-compress AGENTS.md
/skill:caveman-compress docs/preferences.md
/skill:caveman-compress todos.md
```

### What files work

| Type | Compress? |
|------|-----------|
| `.md`, `.txt`, `.rst`, `.typ`, `.typst`, `.tex` | ✅ Yes |
| Extensionless natural language | ✅ Yes |
| `.py`, `.js`, `.ts`, `.json`, `.yaml` | ❌ Skip (code/config) |
| `*.original.md` | ❌ Skip (backup files) |

## How It Work

```text
/skill:caveman-compress AGENTS.md
        ↓
resolve file + refuse unsupported/sensitive paths
        ↓
read input and create backup only when safe
        ↓
compress prose outside protected regions
        ↓
validate headings, code blocks, URLs, file paths, bullets
        ↓
if validation fails: restore original or ask user before retry
```

Manual Pi-tool fallback is allowed when helper dependencies are unavailable: read file, create backup, edit prose only, re-read both files, and verify protected content stayed exact.

## What Is Preserved

Caveman compress natural language. It never touch:

- Code blocks (` ``` ` fenced or indented)
- Inline code (`` `backtick content` ``)
- URLs and markdown links
- File paths (`/src/components/...`)
- Commands (`npm install`, `git commit`)
- Technical terms, library names, API names
- Headings (exact text preserved)
- Tables (structure preserved, cell text compressed)
- Dates, version numbers, numeric values

## Security

`caveman-compress` performs file I/O and may call external model tooling if the bundled helper is used. See [SECURITY.md](./SECURITY.md) for details.

The skill refuses unsupported code/config files and sensitive-looking paths such as credentials, secrets, tokens, keys, `.ssh`, `.aws`, `.gnupg`, `.kube`, and `.docker`.

## Part of Caveman

This skill is part of the [Caveman](https://github.com/JuliusBrussee/caveman) toolkit, ported to Pi package conventions.

- **caveman** — compress replies
- **caveman-compress** — compress memory files safely
