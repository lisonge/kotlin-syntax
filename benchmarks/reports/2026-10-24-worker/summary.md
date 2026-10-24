# Findings

The full lexer/parser and incremental boundary algorithm were not modified. Changes are confined to highlighting serialization, Worker scheduling, caching and buffer transport.

- 100 KiB synthetic tail-edit median: 204.96 ms legacy → 13.66 ms Worker (15.0× faster in this run).
- Its WASM payload decreased from 5,434,565 bytes of full-tree JSON to 289,480 bytes of numeric spans (94.7% reduction per payload). The legacy edit path also serialized and discarded an additional full tree.
- Full parse median for that input changed from 2390.27 ms to 2759.55 ms. There is no full-parser speedup claim; the new path was slower in these samples.
- Full-parse main-thread timer P95 changed from 2395.80 ms to 13.63 ms. Windows timer scheduling granularity contributes to these numbers; they are not measured editor frame times.
- Real parser-source edits still often reparse the large enclosing declaration. Worker isolation keeps the host available, but does not remove that latency.
- The Worker has its own runtime and cache. Sampled process RSS is workload/GC dependent, and the implementation does not claim a memory reduction. Closing documents drops their parser/token caches; disposing the extension terminates the Worker.
- Cancellation drops queued work and obsolete responses. It does not interrupt an already running synchronous WASM parse. One long parse can delay the newest queued result.

See the comparison table below for all workloads, sampling limits and raw JSON filenames. Run `pnpm build` then `pnpm benchmark` to reproduce. Large cases default to five samples, so their tail percentiles are exploratory. For a more stable distribution, increase `BENCH_LARGE_SAMPLES` and repeat on an otherwise idle machine.

# Performance comparison

Node v26.12.1; Intel(R) Core(TM) i9-14900HX. Each mode runs in a separate process, sequentially.

Observed medians below include parsing, classification and token encoding. Worker timings also include scheduling, snapshot cloning and result transfer.

| Input / operation | Legacy ms | Compact ms | Worker ms | Legacy timer P95 ms | Worker timer P95 ms |
|---|---:|---:|---:|---:|---:|
| synthetic-10KiB / full | 35.60 | 33.99 | 34.41 | 38.25 | 14.56 |
| synthetic-10KiB / front | 38.87 | 32.22 | 34.77 | 44.14 | 15.36 |
| synthetic-10KiB / tail | 11.29 | 1.27 | 1.46 | 12.85 | 1.76 |
| synthetic-10KiB / cached | 6.29 | 1.01 | 0.30 | 8.33 | 15.96 |
| synthetic-10KiB / burst | 321.70 | 38.95 | 4.69 | 327.21 | 3.48 |
| synthetic-100KiB / full | 2390.27 | 2795.46 | 2759.55 | 2395.80 | 13.63 |
| synthetic-100KiB / front | 2677.83 | 2808.83 | 2710.53 | 2856.11 | 15.54 |
| synthetic-100KiB / tail | 204.96 | 12.77 | 13.66 | 223.43 | 13.20 |
| synthetic-100KiB / cached | 119.64 | 10.91 | 0.33 | 126.51 | 15.29 |
| parser-source / full | 1167.69 | 1143.42 | 1152.80 | 1221.24 | 16.37 |
| parser-source / front | 1146.54 | 1178.63 | 1174.16 | 1309.16 | 16.36 |
| parser-source / tail | 1123.70 | 1122.78 | 1168.93 | 1136.56 | 11.27 |
| parser-source / cached | 42.83 | 5.58 | 0.24 | 52.90 | 15.51 |

## Method and limits

- Synthetic inputs contain many small declarations; parser-source is the project parser source with one appended sentinel declaration.
- Front edits change one package-name character (full reparse); tail edits change the appended sentinel (suffix reparse).
- Full requests open a fresh document. Cached requests do not change source. Bursts submit 30 snapshots without waiting; the legacy path processes all, while the worker keeps only running/latest work.
- Timer P95 is the delay of a zero-delay timer armed immediately before each request. It measures main-thread availability, not editor frame time or complete user-visible latency.
- Default: 20 measured samples for 10 KiB, 5 for larger files, after 2 warmups. Large-file percentiles are exploratory; P95/P99 with five samples are simply the maximum.
- Cold-first-result times and sampled peak process RSS are in JSON. Only the first input includes Worker startup; later inputs reuse a warm runtime. Static module imports/process launch are not included, and dynamic WASM module load is recorded separately. RSS includes V8/WASM caches and all threads; it is not retained-memory/leak measurement. OS scheduling and GC affect results.
- Legacy intentionally retains both full-tree serializations from the former edit path. Compact uses the same parser and incremental policy with numeric spans. Worker also caches encoded unchanged results.
- The initial baseline.json is a pilot with different edits; use comparison-*.json for the controlled before/after comparison.
- No parser algorithms or grammar behavior were optimized in this experiment.
