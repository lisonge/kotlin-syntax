# Highlight allocation optimization — 2026-10-25

The classifier now produces an internal growable IntArray containing `[start, end, type, modifiers]` records. WASM copies these integers into the existing returned Int32Array. This removes the intermediate List<HighlightSpan>, individual HighlightSpan objects, per-span filtered modifier lists/sets and folding those sets back into bit masks from the WASM path. The public Kotlin highlights() function still returns List<HighlightSpan> with the same modifier sets, materialized from the same classifier output. It avoids temporary filtered lists and uses an empty set for zero modifiers. There is no new public API or second classifier.

The internal integer buffer grows geometrically and is trimmed before export, so allocation and copying are not eliminated. The Kotlin object API now also passes through that integer buffer; its performance was not measured here. No allocation profiler or retained-memory measurement was performed. The results below establish timing improvements on the WASM path, not a measured memory reduction or a speedup for all platforms.

## Method

Windows, Node v26.12.1, Intel Core i9-14900HX. The baseline was built and captured in build/highlight-allocation-before before editing the classifier. Both versions return TypedArray and use identical Worker transfer. Each run uses three alternating-order rounds, 30 warmups and 100 measured requests per backend/case/round (300 samples). Two complete runs are retained because the first parser-source edit case had unusually large P95 values. Builds and tests finished before measurement.

The existing benchmarks/typed-array.ts harness was used with TYPED_ARRAY_BASELINE_DIR pointing at that snapshot. The transfer-only case reuses the initial results and copies the typed buffer before transfer, serving as a transport control. Highlights includes full classification and the result round trip. Edit includes a tail edit, classification and the round trip. UI rendering, source-snapshot transport, cold startup and replacement calculation are excluded. Worker work times, raw samples, matching output checksums, source hashes and binary hashes are retained in [run 1](run-1.json) and [run 2](run-2.json).

## Results

| Input / operation | Run 1 median before → after ms | Run 1 P95 before → after ms | Run 2 median before → after ms | Run 2 P95 before → after ms |
|---|---:|---:|---:|---:|
| 10 KiB / transfer | 0.031 → 0.030 | 0.065 → 0.060 | 0.025 → 0.027 | 0.066 → 0.057 |
| 10 KiB / highlights | 1.029 → 0.833 | 1.192 → 0.954 | 0.998 → 0.804 | 1.136 → 0.925 |
| 10 KiB / edit | 1.281 → 1.092 | 1.532 → 1.309 | 1.263 → 1.070 | 1.497 → 1.234 |
| 100 KiB / transfer | 0.078 → 0.079 | 0.115 → 0.109 | 0.077 → 0.078 | 0.111 → 0.110 |
| 100 KiB / highlights | 10.039 → 7.493 | 10.863 → 8.162 | 9.706 → 7.319 | 10.449 → 8.048 |
| 100 KiB / edit | 11.416 → 8.548 | 12.904 → 9.333 | 11.101 → 8.468 | 12.508 → 9.102 |
| parser source / transfer | 0.055 → 0.056 | 0.098 → 0.075 | 0.055 → 0.054 | 0.116 → 0.069 |
| parser source / highlights | 4.318 → 3.462 | 5.012 → 3.895 | 4.249 → 3.554 | 4.947 → 4.003 |
| parser source / edit | 72.627 → 78.536 | 324.223 → 375.743 | 76.285 → 74.733 | 81.234 → 79.204 |

Classification median improved in both runs: approximately 19% for 10 KiB, 25% for 100 KiB and 16–20% for parser source. The 100 KiB edit median improved by 24–25%. Transfer-only medians were essentially unchanged, consistent with leaving transport alone.

Parser-source editing did not show a stable overall gain: run 1 median worsened from 72.627 to 78.536 ms and P95 rose from 324.223 to 375.743 ms; run 2 improved slightly from 76.285 to 74.733 ms, with P95 81.234 to 79.204 ms. Classification is a small part of that operation. The cause of the first run's large tails was not profiled, so it is not attributed to GC or scheduling as a fact. No universal edit-latency improvement is claimed.

## Validation

Build and typecheck passed. JVM and WASM tests ran freshly, including Unicode and deep nesting. Packaged WASM matched 1069 official lexer fixtures and 3065 official parser fixtures. The compact classification output matched the independent legacy classifier across all parser fixtures. All 15 extension/Worker tests, 4 website tests (including transfer detachment and subsequent edits), and 12 installed-VSIX checks in VS Code 1.141.0 passed. API signatures, token IDs, modifier masks and result ordering are unchanged.
