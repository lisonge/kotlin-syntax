# Upstream sources and attribution

The portable implementation derives from three Apache-2.0 projects:

| Component | Upstream | Copyright attribution | Version pin |
| --- | --- | --- | --- |
| Parser and lexer | [JetBrains Kotlin](https://github.com/JetBrains/kotlin) | JetBrains s.r.o. and contributors; individual source headers retain their notices | [parser metadata](../kotlin-parser/upstream/metadata.json) |
| Formatting rules and KDoc | [ktfmt](https://github.com/facebook/ktfmt) | Meta Platforms, Inc. and affiliates; individual source headers retain their notices | [formatter metadata](../kotlin-format/upstream/metadata.json) |
| Layout engine | [google-java-format](https://github.com/google/google-java-format) | Google Inc. and contributors | [formatter metadata](../kotlin-format/upstream/metadata.json) |

The repository's [LICENSE](../LICENSE) contains the shared Apache-2.0 license text. Duplicate upstream license files are not checked in. The formatter package includes that license; upstream attribution is recorded in the table above and retained source headers. The VSIX includes its existing license. The google-java-format Python diff utility is not included or ported; its separate NCSA license does not apply to the selected Java layout sources.

## Synchronization

```sh
pnpm upstream:sync parser
pnpm upstream:sync ktfmt
pnpm upstream:sync google-java-format
pnpm upstream:sync ktfmt-cases
pnpm upstream:sync all
```

`scripts/upstream.ts` implements all four operations. The component metadata records complete commit IDs, selected source paths and SHA-256 hashes (UTF-8 with CRLF normalized to LF). Caches live under root `build/upstream/<component>/<commit>/`, excluded by the existing `**/build/` ignore rule. Sources retain their repository-relative paths under `sources/`; ktfmt test inputs use `cases/`.

The parser sync fetches seven lexer/grammar reference files. The ktfmt source sync fetches 54 formatting/KDoc files; the layout sync fetches 15 engine/output files, excluding Java AST visitors and CLI sources. Individual source files are fetched from commit-specific raw URLs, so syncing the parser does not download the entire Kotlin repository. The 540 test inputs use a single commit-specific archive to avoid hundreds of requests; unused outputs are not retained as extracted files.

Every selected file is checked against its manifest hash. Complete caches work offline. A missing source file is downloaded individually; missing test inputs can be restored from the cached archive. Modified files fail validation; remove the affected cached file and rerun to restore it. Changing a commit selects a separate cache. Removing root `build/upstream/` clears these resources; cleaning a module alone does not clear the shared cache.

`pnpm generate` automatically prepares parser sources. The formatter's Gradle `jvmTest` automatically prepares only `ktfmt-cases`. Original ktfmt and layout sources are downloaded explicitly for upgrade comparison. Ordinary production builds use the committed portable implementation and generated lexer files, without downloading reference sources. See [parser upgrades](upstream-upgrade.md) and [formatter upgrades](formatting.md) for migration and validation steps.
