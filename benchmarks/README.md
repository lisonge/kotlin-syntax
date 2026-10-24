# Benchmarks

Run `pnpm build` first. Existing commands are unchanged:

- `pnpm benchmark`: compare legacy tree JSON, compact spans and Worker transport in separate sequential processes (`parser.ts`).
- `pnpm benchmark:builder`: compare the captured `build/parser-before` WASM module against the current build (`builder.ts`). Set `BUILDER_BASELINE_DIR` to another complete baseline module directory.
- `node benchmarks/profile-parser.ts after`: record lexer, parse, serialization and highlighting phases. For raw CPU samples, use `node --cpu-prof --cpu-prof-dir=build/benchmarks benchmarks/profile-parser.ts after` after creating that output directory.

All three scripts create and write to `build/benchmarks/` by default, independent of the working directory. `BENCH_OUTPUT_DIR` overrides that destination; relative overrides resolve from the working directory. Generated results are ignored build artifacts and do not overwrite archived reports. Raw CPU profile destinations are controlled separately by Node's `--cpu-prof-dir` option.

`BENCH_SAMPLES` and `BENCH_LARGE_SAMPLES` control parser/Worker repetitions (20 and 5 by default). `BUILDER_SAMPLES` controls builder repetitions (10 by default). Small sample counts are useful for smoke checks, not reliable performance conclusions.

## Historical measurements

- [Worker communication](reports/2026-10-24-worker/summary.md): communication-only experiment before the builder optimization; `comparison-*.json` contains controlled measurements. `baseline.json` is an earlier pilot with different edits and is not a comparable baseline.
- [Builder event storage](reports/2026-10-24-builder/summary.md): controlled `builder-before.json` / `builder-after.json`, phase timings (`stages-*.json`), aggregated CPU samples (`cpu-*-summary.json`) and the subsequent 30-sample Worker run (`comparison-worker.json`).

Each round has one summary combining findings, tables and measurement limitations. Historical JSON data is preserved unchanged. Re-running scripts measures the current source and binaries; it does not recreate old binaries. The old module under `build/parser-before` and full CPU profiles are local build artifacts, not distributed dependencies.
