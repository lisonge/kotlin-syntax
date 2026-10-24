# Full-parse bottleneck and verification

Before optimization, five profiled 100 KiB parses took roughly 2.1–2.3 seconds each, excluding full-tree JSON. Lexer/token JSON took roughly 11–37 ms; full-tree JSON roughly 80–100 ms. The CPU profile aggregated across all stages attributed 40.38% of samples to Marker.drop, 37.57% to Marker.finish, 5.02% to ArrayList.indexOf, and 4.14% to Marker.rollbackTo. These are sampled self-frame proportions, not exact per-method wall times.

Each marker operation searched a growing array and some operations shifted its elements. Many small declarations therefore incurred approximately quadratic event-management work. Marker-owned doubly linked events remove those repeated searches: append/drop/precede are constant-time; rollback visits only the discarded suffix. doneBefore still scans forward to validate ordering. One linear freeze preserves the original trivia binding and tree-building passes.

The controlled same-input binary comparison uses 10 measurements after two warmups in separate processes. 100 KiB parse median fell from 2642.29 ms to 100.57 ms (26.3×), and the real parser source from 1145.74 ms to 66.84 ms (17.1×). The 10-to-100 KiB growth ratio fell from about 63× to about 9×. Exact tree and compact-highlight hashes match for every benchmark input. See the comparison table below and builder-before.json / builder-after.json for raw samples and binary hashes.

A subsequent Worker pipeline run used 30 samples per input: 100 KiB full parse/highlight/encoding/transport median 105.99 ms, P95 112.76 ms; real parser source median 68.56 ms, P95 85.76 ms. This supplementary pipeline run uses the same sources as the earlier Worker benchmark, but has a different sample count. It is not a measured VS Code frame-time result.

After profiling, finish was 0.66% of samples and drop/indexOf had no sampled hits. GC became a larger relative share because the dominant array work disappeared; the short before/after profiles do not establish a GC regression. Full-tree JSON remains expensive (~80–110 ms in this profile), but the extension hot path requests compact spans instead.

Validation passed: 111 official marker/trivia scenarios (including 24 new deterministic mixed-operation cases, one with 2048 groups), 3064 official parser trees, 1069 lexer inputs, common JVM/WASM incremental tests, 11 extension/Worker tests, TypeScript checking and actual VS Code 1.141.0 extension-host tests. Additional negative tests check marker ordering, ownership and invalidation. No grammar production, lexer rule or incremental boundary policy changed.

Raw CPU profiles are local build outputs (`build/parser-before.cpuprofile`, `build/parser-after.cpuprofile`); aggregated samples and phase timings are retained in this directory. These measurements are machine-specific and do not prove equivalence for untested Kotlin inputs.

# Builder storage optimization

Node v26.12.1; 10 measured samples after 2 warmups, separate processes.

| Input | Parse before ms | Parse after ms | Speedup | Tree JSON after ms | Highlight after ms |
|---|---:|---:|---:|---:|---:|
| 10 KiB | 41.79 | 11.67 | 3.6× | 3.42 | 0.84 |
| 25 KiB | 194.64 | 25.61 | 7.6× | 18.94 | 1.99 |
| 50 KiB | 673.22 | 49.76 | 13.5× | 39.79 | 3.93 |
| 100 KiB | 2642.29 | 100.57 | 26.3× | 84.27 | 8.88 |
| parser source | 1145.74 | 66.84 | 17.1× | 26.55 | 4.35 |

Parse includes lexing and building the immutable tree, but excludes JSON serialization and highlighting. Tree/highlight hashes must match exactly. Lexer timings in JSON include token JSON output, so they are an upper bound on pure lexer cost.

The before binary is preserved under build/parser-before; set BUILDER_BASELINE_DIR to another captured baseline directory to reproduce against it. Capture the entire generated WASM module directory before rebuilding. Baseline artifacts and raw CPU profiles are build outputs, not committed dependencies.

Only SyntaxBuilder event storage changed: O(1) direct-link append/drop/precede and suffix-proportional rollback replace searches and shifts in a growing array. Trivia binding still uses the same array pass after a single freeze. doneBefore keeps a forward order validation scan; grammar parsing and token logic are unchanged.

These are local microbenchmarks, not editor frame timings. GC/OS scheduling affect results; raw samples and binary hashes are included in JSON.
