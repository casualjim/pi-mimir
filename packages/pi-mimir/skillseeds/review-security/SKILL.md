---
name: review-security
description: Reviews implementation security by tracing assets, actors, attacker-controlled input, trust boundaries, enforcement points, and sinks across auth, authorization, injection, command/path/URL handling, deserialization, secrets, logs, resource exhaustion, races, supply-chain, and crypto surfaces. Use when asked for security review of external inputs, auth flows, APIs, CLI commands, file/network/subprocess access, stored payloads, dependency scripts, tenant isolation, privilege boundaries, or security-sensitive assumptions.
---

# review-security

Review relevant codebase behavior and implementation paths for exploitable security risk.

Do not implement fixes. Do not emit generic checklist output. Do not report named vulnerability categories without concrete exploit paths. Do not recommend security-theater abstractions.

## Inputs

Use the review request, code under review, related boundary/caller/sink code, config, generated files, tests, fixtures, logs, errors, snapshots, dependency/build scripts, requirements, threat model, deployment assumptions, auth model, tenant model, and data-sensitivity context supplied by the caller.

Inspect enough surrounding codebase context to identify assets, actors, trust boundaries, enforcement points, and sinks.

## Source-of-truth precedence

1. Repository-local security rules and threat model.
2. Actual assets, trust boundaries, deployment context, and data sensitivity.
3. This adversarial security doctrine.
4. Language-specific security idioms and ecosystem guidance.

Do not report generic vulnerabilities without a credible exploit path. Do not ignore a credible exploit path because it lacks a famous category name.

## Core doctrine

Treat every external input, identity claim, path, URL, command, serialized payload, environment value, dependency script, uploaded file, and stored external blob as hostile until validated, constrained, authorized, or escaped at the correct boundary.

Security is a chain of explicit enforcement points.

Every finding must answer:

- what asset is at risk;
- who can influence the input or state;
- what boundary or enforcement point fails;
- what attacker action becomes possible;
- how to repair it without weakening architecture.

Precise vocabulary matters. Report concrete boundary failures, not category labels. YAGNI applies to security theater: recommend frameworks or indirection only when they reduce a concrete risk. Security-sensitive behavior should have frequent test feedback for validation, authorization, parser, and resource-limit behavior.

## Review focus

Ask:

- What assets does the reviewed code read, write, expose, delete, execute, or authorize?
- Who controls each request field, token, ID, filter, path, URL, command argument, file, environment value, serialized blob, dependency script, or stored payload?
- Where does hostile data become trusted, and is that transition justified?
- Is authentication required and actually checked at the boundary?
- Is authorization checked for the exact action and resolved object, not only the route or feature?
- Can a caller access another user or tenant by guessing IDs, paths, keys, filters, or object references?
- Can input alter commands, queries, paths, URLs, templates, headers, logs, prompts, generated files, or serialized output?
- Can file operations escape intended roots through traversal, symlinks, archives, temp files, permissions, or time-of-check/time-of-use gaps?
- Can URLs hit internal services, metadata endpoints, unsafe schemes, private networks, or redirects without timeouts and size limits?
- Are secrets logged, returned, committed, cached, exposed to subprocesses, or passed through command lines unnecessarily?
- Can malformed input cause panic, crash, hang, infinite loop, memory exhaustion, excessive work, or unbounded fan-out?
- Do fallbacks, defaults, feature flags, background jobs, admin paths, or error handling fail open?
- Are generated code, plugins, templates, snapshots, dependency scripts, or shell commands part of the trust boundary?
- Does remediation preserve concrete feature boundaries instead of adding broad security ceremony?

## Findings to hunt

### Trust boundary failures

- Untrusted HTTP, CLI, file, environment, queue, webhook, database payload, or third-party API data used without validation.
- Stored external payload treated as trusted simply because it is in a database or cache.
- Syntactic validation mistaken for semantic authorization.
- Validation repeated inside trusted layers while the actual entry boundary remains weak.
- Permissive defaults for missing required security state.

### Authentication and session failures

- Unauthenticated access to protected operations.
- Weak token validation or missing expiration checks.
- Session fixation or missing rotation where relevant.
- Identity taken from request body, query, header, local storage, or client state without verification.
- Service-to-service identity assumed because traffic is internal.

### Authorization failures

- Object access based only on guessed ID.
- Missing owner, tenant, role, scope, capability, or policy checks.
- Authorization checked before object resolution but not after resolving the actual target.
- List/filter endpoints exposing cross-tenant data.
- Write/delete operations checking feature access but not object access.
- Background jobs or admin paths accidentally bypassing user-level constraints.

### Injection surfaces

- SQL, shell, template, expression, LDAP, path, URL, header, HTML, markdown, YAML, JSONPath, regex, log, prompt, or generated-file injection.
- String-built commands or queries where structured APIs exist.
- Shell metacharacters reaching execution.
- Unsafe template interpolation into generated files, prompts, scripts, or config.
- Regex built from untrusted input without escaping or limits.

### Command and subprocess risks

- `shell=true`, `eval`, or equivalent execution.
- Unquoted shell variables.
- User-controlled command names, flags, paths, current working directory, PATH, or environment.
- Secrets inherited by child processes unnecessarily.
- Credentials passed through command lines visible to other processes.

### Path and file risks

- Path traversal or symlink traversal.
- Unsafe temp files, predictable filenames, or insecure permissions.
- Archive extraction without canonical path checks.
- Delete/write operations not confined to intended roots.
- Time-of-check/time-of-use gaps around file validation and use.

### URL and network risks

- Server-side request forgery.
- Internal address access through user-controlled URLs.
- Redirect following into private networks.
- Unsafe protocol schemes.
- DNS rebinding assumptions.
- Missing timeout or response-size limit.
- Credentials sent to untrusted hosts.

### Deserialization and parser risks

- Unsafe object deserialization.
- Code execution through serialized formats.
- Parser panics on malformed data.
- Unbounded nesting, length, recursion, or decompression.
- Multiple equivalent encodings that bypass validation.
- Stored external blob parsed without schema or version checks.

### Secrets and sensitive data

- Secrets in source, tests, snapshots, logs, errors, telemetry, generated files, or structured logging fields.
- Tokens printed in debug output.
- Credentials exposed to subprocesses or command lines.
- Secrets stored without rotation or scope controls where relevant.
- Secret comparison leaking timing only when the context makes that meaningful.

### Logging and error exposure

- Sensitive inputs logged directly.
- Auth tokens, cookies, API keys, passwords, private paths, PII, or tenant data in logs.
- Errors exposing internal state or existence of protected objects.
- Structured logging fields preserving sensitive values after redaction was expected.

### Resource exhaustion and denial of service

- Unbounded request body, file size, recursion, decompression, regex work, memory buffering, or concurrency.
- Premature materialization of attacker-controlled streams.
- No timeout around network, subprocess, or lock acquisition.
- Per-item expensive operations controlled by user input.
- Unbounded task, goroutine, promise, or thread fan-out.

### Race and consistency risks

- Authorization checked against stale state.
- File path checked before a symlink swap.
- Uniqueness or ownership enforced only in application code when concurrent writes can bypass it.
- Cleanup, revoke, or permission-change flow interruptible into insecure state.

### Supply-chain and build risks

- Dependency install scripts trusted without review.
- Remote scripts piped into shell.
- Unsigned downloads or missing checksum verification when integrity matters.
- Generated code treated as trusted while generation input is attacker-controlled.
- Test fixtures or snapshots containing real secrets.

### Crypto and randomness risks

- Home-grown crypto.
- Weak randomness for tokens or secrets.
- Reversible encoding mistaken for encryption.
- Missing nonce/IV uniqueness where the chosen primitive requires it.
- Insecure password hashing.
- Key material logged, serialized, or compared incorrectly.

Report crypto findings only when cryptographic behavior exists. Do not add crypto advice where there is no crypto surface.

## Language lenses

- Rust: inspect unsafe boundaries, parser panics, `unwrap` on hostile input, command construction, path handling, deserialization crates, secret logging, async resource limits, and security-relevant concurrency.
- TypeScript: inspect schema validation, route auth, object authorization, SSRF, prototype pollution via object merge, template/prompt injection, dependency scripts, environment exposure, and server/client boundary leaks.
- Go: inspect `os/exec`, path/file handling, HTTP clients without timeouts, request-body limits, goroutine fan-out, SQL construction, JSON decoding limits, and exported handlers that assume upstream auth.
- Python: inspect `subprocess`, `shell=True`, YAML/pickle/deserialization, path handling, template rendering, dynamic imports/eval, request-body limits, dependency scripts, and environment leakage.
- Bash: inspect quoting, `eval`, command substitution, globbing, path traversal, temp files, secrets in process arguments, `curl | sh`, destructive commands, and privilege boundaries.

## Workflow

1. Identify assets, actors, attacker-controlled inputs, privileged operations, enforcement points, and sinks in the reviewed area and related codebase paths.
2. Draw trust boundaries mentally: external input, stored external data, internal state, privileged operations, subprocesses, network calls, filesystem access, and generated artifacts.
3. Trace hostile input from boundary to validation, authentication, authorization, escaping, limiting, and sink.
4. Inspect authentication, object authorization, tenant isolation, parser behavior, path/URL/command construction, file/network/subprocess use, logs, errors, snapshots, generated artifacts, and dependency scripts.
5. Inspect fallbacks, defaults, feature flags, retries, background/admin paths, and degraded modes for fail-open behavior.
6. Classify suspicious code as real vulnerability, defense-in-depth improvement, or justified keep-as-is.
7. Return numbered findings only.

## Severity standard

- `blocker`: must fix for credible unauthorized access, data exposure, command execution, path traversal, SSRF, injection, secret leakage, privilege bypass, tenant isolation failure, unsafe deserialization, fail-open security behavior, attacker-controlled unbounded resource exhaustion, or hard repository-rule violation.
- `concern`: should fix or explicitly accept for missing defense at a trust boundary, weak validation, error/log exposure, insufficient limits, race risk, dependency/script risk, or plausible security assumption needing mitigation.
- `suggestion`: consider for defense-in-depth hardening where exploitability is unclear, data sensitivity is low, or deployment controls may already mitigate risk.

## Required output

Return concise findings. No grids or tables. No praise.

```md
## Executive summary

- Highest-risk exploit paths first.
- No generic checklist filler.

## Severity rubric used

- blocker: must fix before acceptance.
- concern: should fix or explicitly accept as debt.
- suggestion: optional hardening.

## Findings

### 1. Short finding title

Severity: blocker
Category: security
Rule reference: repository rule or security doctrine
Location: file, symbol, route, command, workflow, or boundary
Asset at risk: data, capability, identity, secret, filesystem, network, or availability
Attacker control: what input or state the attacker can influence
Evidence: <evidence> quote or exact data-flow description
Problem: what enforcement fails
Exploit path: concrete attacker action and outcome
Recommended remediation: specific fix direction
Scope: local or cross-cutting
Confidence: high, medium, or low

## Trust boundary audit

Summarize assets, actors, inputs, enforcement points, and sinks reviewed.

## False positives / keep as-is

List suspicious-looking code that is justified and why.
```

If no issues are found, return `No issues found` after the audit and keep-as-is sections.
