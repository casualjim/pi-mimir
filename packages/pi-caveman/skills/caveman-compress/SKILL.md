---
name: caveman-compress
description: >
  Compress natural language memory files (AGENTS.md, CLAUDE.md, todos, preferences)
  into caveman format to save input tokens. Preserves all technical substance,
  code, URLs, commands, paths, and structure. Compressed version overwrites the
  original file after backup. Trigger: /skill:caveman-compress FILEPATH or
  "compress memory file".
---

# Caveman Compress

## Purpose

Compress natural language files (`.md`, `.txt`, `.typ`, `.typst`, `.tex`, extensionless notes) into caveman-speak to reduce input tokens. Compressed version overwrites original only after creating `<filename>.original.md` backup.

## Pi Usage

1. Resolve user-provided file path to an absolute path.
2. Read this skill's `SECURITY.md` if safety is uncertain.
3. Prefer the bundled helper when available:

```bash
cd <directory containing this SKILL.md>
python3 -m scripts <absolute_filepath>
```

4. If helper cannot run because Python/Claude/Anthropic dependencies are unavailable, do not invent statistics or silently modify files. Explain blocker and offer manual compression using Pi file tools.
5. For manual compression:
   - Use `read` first.
   - Refuse unsupported or sensitive files.
   - Write backup as `<filename>.original.md` before changing original.
   - Compress only prose outside protected regions.
   - Re-read both files and verify protected content stayed exact.

The bundled upstream helper may use `ANTHROPIC_API_KEY`, optional `anthropic` Python package, or the `claude` CLI. This Pi package does not install those dependencies or authenticate external services.

## Compression Rules

### Remove
- Articles: a, an, the
- Filler: just, really, basically, actually, simply, essentially, generally
- Pleasantries: "sure", "certainly", "of course", "happy to", "I'd recommend"
- Hedging: "it might be worth", "you could consider", "it would be good to"
- Redundant phrasing: "in order to" → "to", "make sure to" → "ensure", "the reason is because" → "because"
- Connective fluff: "however", "furthermore", "additionally", "in addition"

### Preserve EXACTLY (never modify)
- Code blocks (fenced ``` and indented)
- Inline code (`backtick content`)
- URLs and links (full URLs, markdown links)
- File paths (`/src/components/...`, `./config.yaml`)
- Commands (`npm install`, `git commit`, `docker build`)
- Technical terms (library names, API names, protocols, algorithms)
- Proper nouns (project names, people, companies)
- Dates, version numbers, numeric values
- Environment variables (`$HOME`, `NODE_ENV`)

### Preserve Structure
- All markdown headings (keep exact heading text, compress body below)
- Bullet point hierarchy (keep nesting level)
- Numbered lists (keep numbering)
- Tables (compress cell text, keep structure)
- Frontmatter/YAML headers in markdown files

### Compress
- Use short synonyms: "big" not "extensive", "fix" not "implement a solution for", "use" not "utilize"
- Fragments OK: "Run tests before commit" not "You should always run tests before committing"
- Drop "you should", "make sure to", "remember to" — just state action
- Merge redundant bullets that say same thing differently
- Keep one example where multiple examples show same pattern

CRITICAL RULE:
Anything inside ``` ... ``` must be copied EXACTLY.
Do not:
- remove comments
- remove spacing
- reorder lines
- shorten commands
- simplify anything

Inline code (`...`) must be preserved EXACTLY.
Do not modify anything inside backticks.

If file contains code blocks:
- Treat code blocks as read-only regions
- Only compress text outside them
- Do not merge sections around code

## Pattern

Original:
> You should always make sure to run the test suite before pushing any changes to the main branch. This is important because it helps catch bugs early and prevents broken builds from being deployed to production.

Compressed:
> Run tests before push to main. Catch bugs early, prevent broken prod deploys.

Original:
> The application uses a microservices architecture with the following components. The API gateway handles all incoming requests and routes them to the appropriate service. The authentication service is responsible for managing user sessions and JWT tokens.

Compressed:
> Microservices architecture. API gateway route all requests to services. Auth service manage user sessions + JWT tokens.

## Boundaries

- ONLY compress natural language files (`.md`, `.txt`, `.typ`, `.typst`, `.tex`, extensionless)
- NEVER modify: `.py`, `.js`, `.ts`, `.json`, `.yaml`, `.yml`, `.toml`, `.env`, `.lock`, `.css`, `.html`, `.xml`, `.sql`, `.sh`
- Refuse paths or names that look sensitive: credentials, secrets, passwords, tokens, keys, `.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker`
- If file has mixed prose + code, compress ONLY prose sections
- If unsure whether something is code or prose, leave unchanged
- Original file is backed up as `FILE.original.md` before overwriting
- Never compress `FILE.original.md` (skip it)
