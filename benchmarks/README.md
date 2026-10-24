# Benchmarks

Run `pnpm build` first. Existing commands are unchanged:

- `pnpm benchmark`: compare legacy tree JSON, compact spans and Worker transport in separate sequential processes (`parser.ts`).
- `pnpm benchmark:builder`: compare the captured `build/parser-before` WASM module against the current build (`builder.ts`). Set `BUILDER_BASELINE_DIR` to another complete baseline module directory.
- `node benchmarks/profile-parser.ts after`: record lexer, parse, serialization and highlighting phases. For raw CPU samples, use `node --cpu-prof --cpu-prof-dir=build/benchmarks benchmarks/profile-parser.ts after` after creating that output directory.

All three scripts create and write to `build/benchmarks/` by default, independent of the working directory. `BENCH_OUTPUT_DIR` overrides that destination; relative overrides resolve from the working directory. Generated results are ignored build artifacts and do not overwrite archived reports. Raw CPU profile destinations are controlled separately by Node's `--cpu-prof-dir` option.

`BENCH_SAMPLES` and `BENCH_LARGE_SAMPLES` control parser/Worker repetitions (20 and 5 by default). `BUILDER_SAMPLES` controls builder repetitions (10 by default). Small sample counts are useful for smoke checks, not reliable performance conclusions.

## Typed-array transport comparison

Before changing the WASM export, copy the complete `kotlin-parser/dist` directory to `build/typed-array-before`. After rebuilding, run `node benchmarks/typed-array.ts`; `TYPED_ARRAY_BASELINE_DIR` can select another captured JSON baseline. Results, raw samples, source/output checksums and binary hashes are written to `build/benchmarks/typed-array.json` (or `BENCH_OUTPUT_DIR`).

The comparison uses Node Workers with the website's transport strategies: JSON parsing plus array cloning before, native typed arrays plus buffer transfer after. Each case runs three alternating-order rounds, with 30 warmups and 100 measured requests per variant per round. Inputs include 10/100 KiB synthetic files and parser source. It measures transfer alone (including the typed-buffer copy needed for repeated sends), full classification, and a tail edit plus classification. Total timing includes the request/response scheduling and transfer; Worker computation is recorded separately. It excludes rendering, cold startup and source snapshot transfer. It is not a browser frame-time or allocation benchmark. Keep other builds/tests idle during measurement.

The typed-array harness also accepts an earlier TypedArray implementation as its baseline. For the highlight-allocation comparison, set `TYPED_ARRAY_BASELINE_DIR=build/highlight-allocation-before` and use a separate `BENCH_OUTPUT_DIR`. Both sides then use identical buffer transfer; the transfer-only case is a control for transport noise.

## Historical measurements

- [Incremental edit transport](reports/2026-10-25-incremental-transfer/summary.md): versioned deltas versus full snapshots in both consumers, with 300 samples per variant/case, payload sizes, P50/P95 and recovery tests.

- [Highlight allocation](reports/2026-10-25-highlight-allocation/summary.md): two 300-sample-per-case runs comparing object-based classification results with internal integer buffers; both backends use the same TypedArray transport.

- [Kotlin/JS versus Kotlin/Wasm](reports/2026-10-25-js-wasm/summary.md): production fixture/Unicode/depth comparison, fresh-process startup, 300-sample warm parse/edit measurements and generated runtime sizes. The temporary JS target and comparison scripts were removed after evaluation; raw results remain archived.

- [Worker communication](reports/2026-10-24-worker/summary.md): communication-only experiment before the builder optimization; `comparison-*.json` contains controlled measurements. `baseline.json` is an earlier pilot with different edits and is not a comparable baseline.
- [Builder event storage](reports/2026-10-24-builder/summary.md): controlled `builder-before.json` / `builder-after.json`, phase timings (`stages-*.json`), aggregated CPU samples (`cpu-*-summary.json`) and the subsequent 30-sample Worker run (`comparison-worker.json`).

Each round has one summary combining findings, tables and measurement limitations. Historical JSON data is preserved unchanged. Re-running scripts measures the current source and binaries; it does not recreate old binaries. The old module under `build/parser-before` and full CPU profiles are local build artifacts, not distributed dependencies.

## Incremental edit transport

Before changing the protocol, capture the complete extension dist directory as `kotlin-vscode/build/incremental-before` and the website Worker source as `kotlin-website/build/incremental-before.ts`. Then build and run `node benchmarks/incremental-transfer.ts`. It compares the actual old/new Workers and extension clients across 10/100 KiB documents, beginning/end edits, multi-range batches and queued bursts. Three alternating rounds use 30 warmups and 100 measured updates each. Output checksums must match. The report records P50/P95, raw timings and V8-serialized request sizes; website execution uses a Node browser-worker adapter and excludes DOM/rendering. Baseline artifacts are local build outputs.
