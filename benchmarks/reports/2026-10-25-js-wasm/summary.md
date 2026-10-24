# Kotlin/JS versus Kotlin/Wasm — 2026-10-25

The temporary `-PjsComparison` target compiled the same common parser and classifier to production Kotlin/JS. Existing application imports, package exports and WASM production builds are unchanged. No backend switch was made.

## Correctness

- Fresh Gradle runs passed 18 JVM tests, 14 JS tests and 14 WASM tests, including new Unicode and depth-64 portability tests. Two original JS corpus-loop tests initially exceeded Mocha's default two-second timeout; they passed with the experimental target's 60-second timeout.
- Production JS and WASM matched 1069 official lexer fixtures and 3065 official parser fixtures. JS trees also matched the JVM oracle directly. Highlight arrays and token legends matched across targets.
- 948 Unicode edit snapshots matched, including CJK, combining marks, supplementary letters, emoji, isolated high/low surrogates, NUL, Unicode line separators, CRLF and non-ASCII case characters. Both file and script modes were exercised while growing and shrinking text through UTF-16 boundaries. Incremental trees were also compared with fresh parsing.
- The default build, typecheck and test:built passed after the experiment. The final default run reused up-to-date JVM/WASM tests; fixture replay, 15 extension/Worker tests and 4 website tests ran again.

Depth probes run in separate Node processes and exercise opening, highlighting, tree serialization and a tail edit. All probes completed with equal hashes when both backends succeeded. The following are the largest **tested passing depths**, not exact stack limits:

| Input shape | JS | WASM | Observed failure |
|---|---:|---:|---|
| Parentheses | 1024 | 512 | WASM opening at 1024 |
| Nested generic types | 256 | 128 | WASM highlighting at 256; JS tree serialization at 512 |
| Nested blocks | 512 | 256 | WASM highlighting at 512; both opening at 1024 |
| Nested comments | 1024 | 1024 | None within tested depths |

Failures were `RangeError: Maximum call stack size exceeded`. These are observable runtime differences: the implementations are not equivalent for all extreme inputs. They are not evidence of a lexical or grammatical classification mismatch. Depth limits depend on runtime and call stack shape; these observations do not guarantee browser limits. See [verification data](js-wasm-verification.json).

## Performance

Windows, Node v26.12.1, Intel Core i9-14900HX, Kotlin 2.4.21. Builds/tests were finished before measurement. Both targets used production compiler output. Each warm case has three rounds in alternating backend order, 30 warmups then 100 measured operations per round (300 samples per backend/case). Cold measurements use 30 fresh Node processes per backend in alternating order; the OS file cache was not flushed. No browser or UI rendering is included.

Times below are milliseconds, **median / P95**:

| Input / operation | JS | WASM |
|---|---:|---:|
| 10 KiB parse | 14.053 / 15.267 | 9.264 / 10.070 |
| 10 KiB front edit + classification | 15.732 / 17.210 | 10.676 / 11.490 |
| 10 KiB tail edit + classification | 1.657 / 1.958 | 1.263 / 1.528 |
| 100 KiB parse | 137.312 / 148.427 | 99.503 / 104.217 |
| 100 KiB front edit + classification | 151.582 / 158.750 | 112.767 / 122.129 |
| 100 KiB tail edit + classification | 15.569 / 17.750 | 12.192 / 13.445 |
| Parser source parse | 96.917 / 104.823 | 65.761 / 69.385 |
| Parser source front edit + classification | 102.967 / 108.320 | 71.916 / 76.330 |
| Parser source tail edit + classification | 107.156 / 112.094 | 75.800 / 79.489 |

Parse measures openDocument and closeDocument without tree JSON serialization or highlighting. Continuous edits alternate one character in the package name or a trailing sentinel, retaining the same document and generating typed highlights after every edit. Source construction, equality checks and tree serialization occur outside the timed sections. There is no Worker transport, source-snapshot cloning, replacement calculation or decoration rendering in these timings. Final tree/highlight hashes match between backends for every paired round. Parser-source tail edits need not achieve the same prefix reuse as synthetic declarations; the benchmark does not assume they do.

| Cold 10 KiB operation | JS median / P95 | WASM median / P95 |
|---|---:|---:|
| Module import | 5.969 / 7.157 | 4.667 / 5.652 |
| First parse + classification after import | 41.123 / 48.723 | 41.087 / 49.738 |
| Import + first result | 46.976 / 55.945 | 45.788 / 55.209 |
| Whole child process round trip | 124.393 / 144.713 | 123.542 / 150.770 |

Fresh process import does not include all lazy initialization; first-result timing captures that remaining cost. Whole-process time additionally includes Node startup, TypeScript script loading, source preparation, output and process exit. These are local-file cold-runtime results, not cold network downloads. Cold medians are close and do not justify selecting either backend for startup alone.

| Generated runtime artifacts | JS | WASM |
|---|---:|---:|
| Uncompressed bytes | 377690 | 345269 |
| Sum of per-file gzip level 9 bytes | 70753 | 105444 |

Sizes include generated `.mjs` runtime dependencies and `.wasm`, excluding source maps, declarations, shared TS utilities and application bundles. They are not Vite/VSIX total sizes. JS is about 9% larger uncompressed but 33% smaller with gzip in this build. Compression does not establish startup speed or memory usage. Raw samples and per-artifact hashes are in [performance data](js-wasm-performance.json).

## Decision

Keep the existing WASM implementation for now. Its measured warm parse and edit latency, including P95, is lower across these cases; the JS cold-start results are similar. JS offers simpler integration, smaller compressed runtime artifacts and greater depth tolerance for some tested shapes, but these advantages do not establish an overall replacement benefit. The temporary JS target and comparison code were subsequently removed; Unicode and nested-input tests remain in commonTest. No allocation/retained-memory or multi-browser comparison was performed.

The temporary comparison target and scripts have been removed following the decision to retain WASM. This archive preserves the measured results, methodology and artifact hashes; it is historical evidence, not a runnable comparison against the current checkout.
