# Updating the Kotlin reference

This is the manual procedure for changing the official syntax reference. Updating dependencies alone does not update the portable parser.

## Source and dependency pins

- [kotlin-parser/upstream/metadata.json](../kotlin-parser/upstream/metadata.json): repository, commit, lexer path/checksum and parser source paths/checksums.
- `build/upstream/parser/<commit>/sources/`: downloaded reference sources; original repository-relative paths are preserved.
- [gradle/libs.versions.toml](../gradle/libs.versions.toml): Kotlin plugin, test library and compiler oracle version.
- `kotlin-parser/scripts/generate-lexer.ts`: lexer translation and generation.
- `kotlin-parser/src/commonMain/kotlin/li/songe/kotlin/`: portable implementation.

## Upgrade sequence

1. Select an official release and its exact source commit. Compare the recorded upstream parser, lexer, whitespace builder and comment binders against that commit. Review licensing and source attribution when changing the reference.
2. Update source paths, the commit and checksums in `metadata.json` together (UTF-8 text with CRLF normalized to LF). Run `pnpm upstream:sync parser` to fetch and verify the selected files, or let `pnpm generate` do this automatically. Align the compiler oracle and Kotlin plugin pins with the chosen release. See [source synchronization](upstream-sources.md); original reference files are no longer checked in.
3. Review `generate-lexer.ts` before running `pnpm generate`. Its generated header reads the metadata version, while its expected action count remains release-specific; inspect and update these when upstream changes. Unsupported action syntax must be translated rather than bypassing its validation. Inspect `LexerTables.kt` and `LexerActions.kt` regeneration.
4. Port grammar, token, builder, trivia and error-recovery changes into common Kotlin. Preserve the correspondence with the official parsing flow. Adapt the JVM oracle only where the official APIs changed, and add valid, malformed, script and incremental-edit cases for new behavior.
5. Run the commands in [testing.md](testing.md). Confirm JVM oracle comparisons, packaged WASM fixture replay, compact-highlight equivalence and real extension-host behavior. Generate oracle fixtures from the new official compiler rather than accepting portable-parser output as the expected result.
6. Update [compatibility.md](compatibility.md) with the tested target and any remaining differences. If performance is being compared, capture the complete old WASM module before rebuilding, then use the benchmark workflow with controlled inputs and recorded hashes.

## Generated and historical artifacts

`LexerTables.kt` and `LexerActions.kt` are committed generated sources; edit their generator or upstream inputs. Kotlin-generated `.mjs`, `.wasm` and declarations under `dist/` are build output. JVM oracle fixtures under `build/oracle/` are test output. Archived benchmark JSON describes the binaries measured at that time and should not be rewritten to describe a newer release.

Node/pnpm versions remain in root `package.json` devEngines; Gradle remains in the Wrapper configuration. A Kotlin syntax upgrade does not itself require changing those independent runtime pins.
