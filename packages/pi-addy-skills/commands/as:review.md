---
description: Conduct a five-axis code review — correctness, readability, architecture, security, performance
---

Use the `code-review-and-quality` skill workflow for this request.

Review the current changes (staged or recent commits) across all five axes:

1. **Correctness** — Does it match the spec? Edge cases handled? Tests adequate?
2. **Readability** — Clear names? Straightforward logic? Well-organized?
3. **Architecture** — Follows existing patterns? Clean boundaries? Right abstraction level?
4. **Security** — Input validated? Secrets safe? Auth checked? (Use the `security-and-hardening` skill)
5. **Performance** — No N+1 queries? No unbounded ops? (Use the `performance-optimization` skill)

On omp, map the diff first with codebase-memory `detect_changes`, trace caller impact with `trace_path`, and consult `security://scans` findings for the security axis when a scan exists.

Categorize findings as Critical, Required, Optional, or Nit.
Output a structured review with specific file:line references and fix recommendations.
