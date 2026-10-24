# Kotlin Syntax

pnpm/Node + Gradle Kotlin DSL workspace for a portable Kotlin lexer/parser and a VS Code syntax-highlighting extension.

The common Kotlin implementation targets the official Kotlin syntax reference recorded in [metadata.json](kotlin-parser/upstream/metadata.json). JVM tests compare it with the official compiler; the packaged WASM module replays the verified fixtures. The extension parses in a Node Worker and provides syntax-derived semantic tokens. Compiler semantic analysis is outside the current scope.

## Quick start

Use the Node and pnpm versions in [package.json](package.json), JDK 21 and the checked-in Gradle Wrapper. Kotlin is pinned in [gradle/libs.versions.toml](gradle/libs.versions.toml).

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test:built
pnpm test:extension
```

The extension-host test requires an installed VS Code; see [testing](docs/testing.md) for executable selection and isolation.

## Commands

| Command | Purpose |
|---|---|
| `pnpm build` | Build WASM package and extension assets |
| `pnpm typecheck` | Check TypeScript without emitting JavaScript |
| `pnpm test` | JVM/WASM tests, official fixture replay and extension/Worker tests |
| `pnpm test:built` | Run tests using existing build assets; run `pnpm build` first |
| `pnpm test:extension` | Test the built extension in an installed VS Code host |
| `pnpm generate` | Regenerate lexer tables/actions from verified upstream input |
| `pnpm benchmark` | Compare legacy, compact and Worker pipelines |
| `pnpm benchmark:builder` | Compare captured baseline and current parser builds |

## Documentation

- [Architecture and APIs](docs/architecture.md): module boundaries, incremental documents, WASM and Worker flow.
- [Compatibility](docs/compatibility.md): tested syntax target, coverage and known limitations.
- [Testing](docs/testing.md): focused checks, official differential evidence and CI coverage.
- [Upstream upgrades](docs/upstream-upgrade.md): source pins, generation and validation procedure.
- [Benchmarks](benchmarks/README.md): commands, temporary output and historical reports.

`kotlin-parser/` contains the KMP implementation and compiler oracle tests; `kotlin-vscode/` contains the extension. Generated packages live in each module's `dist/`; transient outputs live under `build/`. Handwritten Node entry points run as native TypeScript.

## License

Licensed under [Apache-2.0](LICENSE).
