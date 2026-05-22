---
name: review-performance
description: Reviews implementation performance by hunting structural costs: premature stream materialization, needless copying/cloning, avoidable allocation, repeated serialization/parsing, N+1 I/O, lock contention, unbounded concurrency, and APIs that force callers to pay unnecessary costs. Use when asked for performance review of data-heavy paths, persistence/search/streaming APIs, parsers, async workflows, hot paths, batch jobs, CLI pipelines, or hidden memory/throughput risks.
---

# review-performance

Review relevant codebase behavior and implementation paths for structural performance: data flow, allocation, I/O, and coordination costs.

Do not implement fixes. Do not chase micro-optimizations. Do not add complexity without evidence. Do not ignore structural waste just because data is “usually small” unless size is bounded by contract.

## Inputs

Use the review request, implementation files under review, related producers/consumers/sinks, workload expectations, benchmarks, profiles, logs, tests, requirements, design notes, and repository performance conventions supplied by the caller.

Inspect enough surrounding codebase context to understand source-to-sink data flow, materialization points, public API shape, I/O behavior, locking, and concurrency.

## Source-of-truth precedence

1. Repository-local performance constraints, streaming rules, pagination rules, and workload assumptions.
2. Actual workload shape, hotness, data-size expectations, and latency/throughput requirements.
3. The data-flow and allocation rules in this skill.
4. Language-specific performance idioms.

## Core doctrine

Do not materialize, clone, allocate, serialize, parse, lock, spawn, or buffer before there is a real reason.

A real reason is ownership at a stable boundary, writing to a real sink, bounded result contract, genuine sort/group/dedup/random access/repeated traversal, correctness isolation, or measured evidence.

Convenience is not enough for unbounded, external, or user-controlled data.

Performance review is mostly about shape:

- where data comes from;
- where it is reduced, filtered, transformed, buffered, or copied;
- where it reaches a real sink or owner;
- which APIs force callers to pay costs they do not need;
- which operations scale with input size, fan-out, or contention.

## Review focus

Ask:

- Is data size bounded by contract, caller-bounded, user-controlled, external, unknown, or unbounded?
- Where does data originate, and where is the first real sink or owner?
- Does any API force `Vec`/array/list/map/string/buffer/object ownership before the caller’s real sink?
- Are streams, iterators, cursors, generators, readers, writers, or shell pipelines collected too early?
- Are strings, bytes, arrays, maps, paths, JSON values, or equivalent representations copied unnecessarily?
- Is data parsed, serialized, decoded, encoded, formatted, normalized, validated, or regex-compiled repeatedly?
- Are database/search/network/filesystem calls batched, projected, filtered, paginated, and streamed appropriately?
- Is there N+1 I/O, per-item round-tripping, post-pagination filtering, or full-row/full-file loading where a narrower flow would work?
- Are locks held across I/O, awaits, callbacks, slow CPU work, or unrelated independent data?
- Are tasks, goroutines, promises, threads, subprocesses, channels, queues, eager logs, or caches adding unjustified coordination or allocation cost?

## Findings to hunt

- Premature materialization: collecting DB/search/log/event results, full files, full command output, full response bodies, or pages before filtering, limiting, streaming, or writing.
- Unbounded collection APIs: `getAll`, `listAll`, `loadEverything`, `readToEnd`, or public owned aggregates without hard bounds, cursor, stream, iterator, page, or sink alternative.
- Needless copying: cloning to satisfy avoidable ownership, defensive copies without mutation risk, representation churn, copying only to pass through, or converting between equivalent representations repeatedly.
- Avoidable allocation: repeated buffer creation, avoidable intermediate arrays/maps/objects, eager formatting, temporary strings, boxed/dynamic structures, or cache entries without reuse evidence.
- Repeated conversion: parse/stringify/parse loops, repeated JSON/YAML/TOML/CSV decoding, path/URL normalization, regex compilation, or trusted-state validation.
- I/O inefficiency: N+1 queries, one request per item, full scans where indexed lookup is expected, full rows where projection is enough, or whole-body buffering before the sink.
- Pagination/backpressure failures: filtering after pagination, broken cursors, unbounded pages, ignored cancellation, queue buildup, or streams converted to lists before output.
- Coordination cost: lock scope too broad, locks held across awaits/I/O, unbounded fan-out, sequential awaits where safe bounded concurrency would help, or concurrency overhead for tiny work.
- Cost-forcing API shape: owned collection/string inputs or outputs where borrowed views, structured values, iterators, streams, readers, writers, cursors, callbacks, or direct sinks would compose better.
- Measurement gaps: performance claims that rely on intuition where the cost is workload-dependent and should be benchmarked, profiled, or bounded by contract.

## Language lenses

- Rust: inspect `.collect()`, clone/to_owned/to_string abuse, unbounded `Vec<T>`/`String`, `Arc`/box/dyn overhead, lock scope, async `Send` pressure; prefer `&str`, `&[T]`, `&Path`, iterators, streams, readers, writers.
- Go: inspect slice/map growth, string/byte conversion, interface boxing, escapes, goroutine fan-out, channel overhead, `defer` in hot loops, scanner limits, per-item DB/HTTP; prefer readers/writers and bounded workers.
- TypeScript: inspect `Array.from`, spreads, chained array passes, object cloning, JSON round trips, Promise fan-out, response buffering, unbounded result arrays; prefer async iterables, streams, cursors, direct transforms.
- Python: inspect list materialization, repeated comprehensions, dataframe conversions, JSON round trips, regex compilation, subprocess buffering, per-item I/O; prefer generators, chunked reads, context-managed streams.
- Bash: inspect command substitution capturing large output, repeated subprocesses in loops, unquoted expansion that adds work/errors, and pipelines that hide buffering/failure; prefer streaming pipelines and safe `while read` loops.

## Workflow

1. Identify data-heavy paths, external input sizes, persistence/search/listing APIs, parsers, hot workflows, and CLI/batch pipelines.
2. Trace source -> reductions -> transformations -> materialization -> sink/owner.
3. Mark each materialization/copy/parse/serialize/lock/spawn point as justified, unjustified, or workload-dependent.
4. Inspect public APIs for allocation-heavy shapes that force caller cost.
5. Inspect database, network, filesystem, subprocess, and search behavior for missing batching, projection, filtering, cancellation, backpressure, or streaming.
6. Inspect lock scope, fan-out, task scheduling, queues, retries, caches, and eager logging.
7. Separate structural findings from speculative micro-optimizations and keep false positives explicit.

## Severity standard

- `blocker`: must fix for unbounded materialization/memory growth, denial-of-service risk, N+1 in core paths, lost backpressure, broken pagination, repository streaming-rule violation, or API shape that makes efficient use impossible.
- `concern`: should fix or explicitly accept for significant avoidable allocation/copying, repeated conversion, costly per-item I/O, lock scope risk, missing cancellation, insufficient bounds, or inefficient API shape with real workload impact.
- `suggestion`: consider for plausible improvement needing measurement or affecting bounded/non-hot paths.

## Required output

Return concise findings. No grids or tables. No praise.

```md
## Executive summary

- Highest-cost structural issues first.
- No micro-optimization filler.

## Severity rubric used

- blocker: must fix before acceptance.
- concern: should fix or explicitly accept as debt.
- suggestion: optional improvement.

## Findings

### 1. Short finding title

Severity: blocker
Category: performance
Rule reference: repository rule, streaming rule, or performance doctrine
Location: file, symbol, API, query, loop, or workflow
Evidence: <evidence> quote or exact source-to-sink description
Problem: what cost is paid too early or unnecessarily
Why it matters: memory, latency, throughput, allocation, lock, I/O, or scaling impact
Recommended remediation: concrete lower-cost shape
Scope: local or cross-cutting
Confidence: high, medium, or low

## Data-flow and allocation audit

Summarize source-to-sink paths reviewed and where materialization, copying, parsing, serialization, or locking occurs.

## False positives / keep as-is

List suspicious-looking costs that are justified and why.
```

If no issues are found, return `No issues found` after the audit and false-positive sections.
