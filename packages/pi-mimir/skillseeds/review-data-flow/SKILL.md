---
name: review-data-flow
description: "Reviews data movement and structural resource costs: filtering, pagination, streaming, materialization, copying/cloning, allocation, serialization/parsing, batching, N+1 I/O, backpressure, lock contention, and APIs that force callers to pay unnecessary costs. Use when asked for data-flow or performance review of data-heavy paths, persistence/search/streaming APIs, parsers, async workflows, hot paths, batch jobs, CLI pipelines, or hidden memory/throughput risks."
---

# review-data-flow

Review relevant codebase behavior and implementation paths for data-flow shape, allocation, I/O, and coordination costs.

Do not implement fixes. Do not chase micro-optimizations. Do not add complexity without evidence. Do not ignore structural waste just because data is “usually small” unless size is bounded by contract.

## Inputs

Use the review request, implementation files under review, related producers/consumers/sinks, workload expectations, benchmarks, profiles, logs, tests, requirements, design notes, and repository performance conventions supplied by the caller.

Inspect enough surrounding codebase context to understand source-to-sink data flow, reductions, transformations, materialization points, public API shape, I/O behavior, locking, concurrency, boundaries, and sinks.

## Source-of-truth precedence

1. Repository-local data-flow, performance, streaming, pagination, and workload rules.
2. Actual workload shape, hotness, data-size expectations, and latency/throughput requirements.
3. The data-flow, materialization, and allocation rules in this skill.
4. Language-specific performance idioms.

## Core doctrine

Data should move through the system in the intended shape: filtered, bounded, streamed, borrowed/shared, lazily transformed, or intentionally materialized only at a real owner or sink.

Do not materialize, clone, allocate, serialize, parse, lock, spawn, or buffer before there is a real reason.

A real reason is ownership at a stable boundary, writing to a real sink, bounded result contract, genuine sort/group/dedup/random access/repeated traversal, correctness isolation, or measured evidence.

Convenience is not enough for unbounded, external, unknown-size, hot, or user-controlled data.

Review language-agnostic data movement invariants, not generic performance preferences. Treat allocation, copying, cloning, string conversion, buffering, and per-item external work as reviewable when they occur on large, user-controlled, external, hot, or otherwise unbounded paths.

## Vocabulary

- **Source**: database, search backend, filesystem, network, queue, API, user-controlled collection, generated stream, or external service
- **Reduction**: filter, predicate, projection, aggregation, sort, limit, offset, cursor, or deduplication
- **Transformation**: map, parse, encode, decode, format, enrich, normalize, or convert representation
- **Materialization**: collect into array/vector/list/map/string/buffer/object graph, load all rows, build full response, or otherwise own the whole data set
- **Boundary**: API, module, feature, service, transport, storage adapter, worker, process, thread, or async task boundary
- **Sink/owner**: response stream, file write, database write, queue publish, explicit bounded page, cache, or in-memory model whose job is to own the complete data set
- **Cardinality**: known bounded, caller-bounded, user-controlled, external, unknown, or unbounded
- **Work shape**: set-oriented/batched/streaming work versus per-item sequential work or N+1 external calls

## Review focus

Ask:

- Is data size bounded by contract, caller-bounded, user-controlled, external, unknown, or unbounded?
- Where does data originate, and where is the first real sink or owner?
- Where are reductions, transformations, materializations, and owner boundaries?
- Does any API force `Vec`/array/list/map/string/buffer/object ownership before the caller’s real sink?
- Are streams, iterators, cursors, generators, readers, writers, or shell pipelines collected too early?
- Are strings, bytes, arrays, maps, paths, JSON values, or equivalent representations copied unnecessarily?
- Is data parsed, serialized, decoded, encoded, formatted, normalized, validated, or regex-compiled repeatedly?
- Are database/search/network/filesystem calls batched, projected, filtered, paginated, and streamed appropriately?
- Is there N+1 I/O, per-item round-tripping, post-pagination filtering, or full-row/full-file loading where a narrower flow would work?
- Are locks held across I/O, awaits, callbacks, slow CPU work, or unrelated independent data?
- Are tasks, goroutines, promises, threads, subprocesses, channels, queues, eager logs, or caches adding unjustified coordination or allocation cost?

## Data-flow review criteria

- **Reduction before pagination**: filtering, authorization, relationship checks, search predicates, file/path/label filters, and other selection logic happen before limit/offset/skip/cursor pagination whenever the backend can express them. If a required predicate cannot be pushed down, prefer a structured error or explicit bounded candidate strategy over silent partial-looking results.
- **No post-pagination filtering surprises**: flag code that fetches a limited or offset candidate set and then filters it in application code, making result counts, pagination, or ordering misleading.
- **Streaming until sink**: external, user-controlled, or unknown-size data remains streaming/lazy until a real sink or owner boundary. Flag premature collection, buffering, or full response assembly before that boundary.
- **Bounded materialization**: materialization must have a clear bound or owner. Flag unbounded arrays/vectors/lists/maps/buffers and APIs that force callers to own a whole data set when a stream, cursor, iterator, page, or sink would preserve flow.
- **Allocation and duplication pressure**: flag avoidable copying, cloning, string conversion, serialization/deserialization loops, intermediate collection builds, wrapper allocations, or representation churn on large, repeated, hot, external, or user-controlled paths.
- **Batching and N+1 work**: flag per-item database/search/network/filesystem calls or predicate checks when the work should be expressed as a set-oriented query, batch request, join, prefetch, or streaming pipeline.
- **Transformation placement**: transformations should happen at the boundary that owns the representation change. Flag repeated parse/format/normalize/encode/decode work across layers when one clear boundary should perform it once.
- **Backpressure and response flow**: flag buffering a stream before sending, writing, publishing, or handing it to the intended sink when streaming/backpressure should be preserved.
- **Sequential async or concurrent work shape**: flag one-at-a-time async loops or unbounded concurrency when batching, bounded concurrency, streaming, or backpressure would better match the source and sink.
- **Intentional owners**: do not report complete materialization when the reviewed code is itself the explicit owner/sink, such as an in-memory analytical model, bounded page object, cache fill, export object, or required aggregate result.

## Findings to hunt

- Premature materialization: collecting DB/search/log/event results, full files, full command output, full response bodies, or pages before filtering, limiting, streaming, or writing
- Unbounded collection APIs: `getAll`, `listAll`, `loadEverything`, `readToEnd`, or public owned aggregates without hard bounds, cursor, stream, iterator, page, or sink alternative
- Needless copying: cloning to satisfy avoidable ownership, defensive copies without mutation risk, representation churn, copying only to pass through, or converting between equivalent representations repeatedly
- Avoidable allocation: repeated buffer creation, avoidable intermediate arrays/maps/objects, eager formatting, temporary strings, boxed/dynamic structures, or cache entries without reuse evidence
- Repeated conversion: parse/stringify/parse loops, repeated JSON/YAML/TOML/CSV decoding, path/URL normalization, regex compilation, or trusted-state validation
- I/O inefficiency: N+1 queries, one request per item, full scans where indexed lookup is expected, full rows where projection is enough, or whole-body buffering before the sink
- Pagination/backpressure failures: filtering after pagination, broken cursors, unbounded pages, ignored cancellation, queue buildup, or streams converted to lists before output
- Coordination cost: lock scope too broad, locks held across awaits/I/O, unbounded fan-out, sequential awaits where safe bounded concurrency would help, or concurrency overhead for tiny work
- Cost-forcing API shape: owned collection/string inputs or outputs where borrowed views, structured values, iterators, streams, readers, writers, cursors, callbacks, or direct sinks would compose better
- Measurement gaps: performance claims that rely on intuition where the cost is workload-dependent and should be benchmarked, profiled, or bounded by contract

## Language lenses

- Rust: inspect `.collect()`, clone/to_owned/to_string abuse, unbounded `Vec<T>`/`String`, `Arc`/box/dyn overhead, lock scope, async `Send` pressure. Prefer `&str`, `&[T]`, `&Path`, iterators, streams, readers, writers.
- Go: inspect slice/map growth, string/byte conversion, interface boxing, escapes, goroutine fan-out, channel overhead, `defer` in hot loops, scanner limits, per-item DB/HTTP. Prefer readers/writers and bounded workers.
- TypeScript: inspect `Array.from`, spreads, chained array passes, object cloning, JSON round trips, Promise fan-out, response buffering, unbounded result arrays. Prefer async iterables, streams, cursors, direct transforms.
- Python: inspect list materialization, repeated comprehensions, dataframe conversions, JSON round trips, regex compilation, subprocess buffering, per-item I/O. Prefer generators, chunked reads, context-managed streams.
- Bash: inspect command substitution capturing large output, repeated subprocesses in loops, unquoted expansion that adds work/errors, and pipelines that hide buffering/failure. Prefer streaming pipelines and safe `while read` loops.

## Workflow

1. Identify data-heavy paths, external input sizes, persistence/search/listing APIs, parsers, hot workflows, and CLI/batch pipelines.
2. Trace source -> reductions -> transformations -> materialization -> sink/owner.
3. Mark each materialization/copy/parse/serialize/lock/spawn point as justified, unjustified, or workload-dependent.
4. Inspect public APIs for allocation-heavy shapes that force caller cost.
5. Inspect database, network, filesystem, subprocess, and search behavior for missing batching, projection, filtering, cancellation, backpressure, or streaming.
6. Inspect lock scope, fan-out, task scheduling, queues, retries, caches, and eager logging.
7. Separate structural findings from speculative micro-optimizations and keep false positives explicit.

## Severity standard

- `blocker`: must fix for incorrect or misleading results, unbounded materialization/memory growth, denial-of-service risk, N+1 in core paths, lost backpressure, broken pagination, repository streaming-rule violation, forbidden predicate/materialization behavior, or API shape that makes efficient use impossible.
- `concern`: should fix or explicitly accept for significant avoidable allocation/copying, repeated conversion, costly per-item I/O, lock scope risk, missing cancellation, weak bounds, unclear sink ownership, or inefficient API shape with real workload impact.
- `suggestion`: consider for local simplification or plausible improvement needing measurement or affecting bounded/non-hot paths.

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
Category: data flow
Rule reference: repository rule, streaming rule, pagination rule, or data-flow doctrine
Location: file, symbol, API, query, loop, or workflow
Evidence: <evidence> — source/cardinality/reduction/transformation/materialization/sink evidence
Problem: what cost is paid too early, unnecessarily, or incorrectly
Why it matters: correctness, memory, latency, throughput, allocation, backpressure, lock, I/O, or scaling impact
Recommended remediation: concrete lower-cost shape
Scope: local or cross-cutting
Confidence: high, medium, or low

## Data-flow and allocation audit

Summarize source-to-sink paths reviewed and where materialization, copying, parsing, serialization, locking, pagination, batching, and backpressure occur.

## False positives / keep as-is

List suspicious-looking costs that are justified and why.
```

If no issues are found, return `No issues found` after the audit and false-positive sections.
