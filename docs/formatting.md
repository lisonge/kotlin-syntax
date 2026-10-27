# Kotlin formatting

`kotlin-format` is a Kotlin Multiplatform module targeting JVM and WASM. Production code has no ktfmt, IntelliJ PSI, Guava, google-java-format or Java compiler runtime dependency. It depends on `kotlin-parser`; a per-format typed view supplies the tree access used by the upstream formatting rules.

## API

```kotlin
import li.songe.kotlin.format.*

val result = format(source, formattingOptions(FormatStyle.KOTLINLANG), script = false)
val narrow = format(source, formattingOptions(FormatStyle.GOOGLE).copy(maxWidth = 80))
```

The default style is `KOTLINLANG`, width 100. `META` and `GOOGLE` are also available. Options expose block/continuation indentation, trailing-comma management, unused-import removal and lambda-break preservation. Offsets are UTF-16. Formatting covers complete `.kt` and `.kts` documents, preserves the source line-ending convention, and throws on syntax errors. Range formatting and compiler semantic analysis are outside this API. The supported width range is 1–999.

The `kotlin-format/wasm` package exports synchronous `formatCode(source, style, maxWidth, script)` and `formatWithOptions(...)` after module initialization. The VS Code extension calls `formatWithOptions` in a lazy Worker, checks document version and cancellation before returning an edit, and terminates the Worker on disposal. Cancellation discards a result; it does not interrupt a synchronous WASM call already executing.

The extension retains one latest input/result pair per open document. An exact match on source text, style, width and file/script mode returns the cached result without a Worker call. Identical pending requests share a computation with independent cancellation; errors and fully cancelled work are not cached. Closing a document releases its cache and pending subscribers. A formatter output is only treated as stable after it has itself been formatted without changes, preserving ktfmt's non-idempotent second-pass behavior. The cache is in memory only and is released when the extension is disposed.

## Node CLI and project configuration

The same pnpm package contains the CLI; Gradle builds the WASM core and tsdown builds the Node entry. Build from the repository with `pnpm --filter kotlin-format build`. The built distribution needs Node.js (validated with the workspace's pinned version), but no JDK, Gradle or upstream downloads. The package is configured for public npm publication by the shared release workflow, with the same version as the VS Code extension. See [release setup](testing.md#releases).

```sh
node kotlin-format/dist/cli.mjs src --check
node kotlin-format/dist/cli.mjs "src/**/*.kt" --write
node kotlin-format/dist/cli.mjs src/Main.kt --max-width 120 --write
node kotlin-format/dist/cli.mjs --stdin-filepath src/Main.kt < src/Main.kt
```

The package's `bin` entry exposes `kotlin-format` when installed/linked. `--help` lists all flags. Without `--write` or `--check`, one file or stdin is written to stdout. With either flag and no paths, the current directory is scanned. Files and directories may be mixed; overlapping paths are deduplicated. Directory/glob inputs select `.kt` and `.kts`, respect nested `.gitignore` rules, and skip symlinks, `.git` and `node_modules`. No matches is an error. Exit codes are 0 for success, 1 for formatting differences in check mode, and 2 for invalid arguments, configuration, syntax or I/O failures. Failed files are not rewritten; other files continue. Each file receives exactly one upstream-compatible formatting pass, with no persistent cache or convergence loop.

Place `kotlin-format.json` in the project:

```json
{
  "style": "KOTLINLANG",
  "maxWidth": 100,
  "removeUnusedImports": true,
  "preserveLambdaBreaks": true
}
```

Alternatively, use `kotlin-format.config.js`, `kotlin-format.config.mjs` or `kotlin-format.config.ts` with a default-exported object:

```ts
const maxWidth: number = 100;
export default { style: 'KOTLINLANG', maxWidth, removeUnusedImports: true };
```

JSON uses native `JSON.parse` (no comments or trailing commas); modules use Node's native loader. Module configurations support ESM only and must use `export default`; CommonJS `module.exports` and `.cjs` are not supported. JS/TS follow Node's module rules; use `"type": "module"` in the project or `.mjs` for an unambiguous ESM entry. TS uses the runtime's native type stripping; no transpiler, tsconfig path mapping or type checking is performed while loading. Use erasable TypeScript syntax and explicit relative import extensions. Module configs must export an object, not a function. JSONC is no longer supported.

Discovery starts at each source file's directory and stops at the nearest directory containing `package.json` or `.git` (or the filesystem root). The nearest config wins; parent configurations are not merged. Multiple supported configuration files in the same directory are an error. Unknown options and invalid values are rejected. `--config path` selects an explicit JSON/JS/MJS/TS config; CLI flags override config values, then formatter defaults apply. Boolean flags have `--no-` forms. `--stdin-filepath` supplies the discovery location and `.kts` mode for stdin. Edits to the config entry itself are reloaded using its content hash; imported helper modules follow Node's normal cache, so restart the editor after changing those helpers.

`kotlin-format/config` exports the configuration reader and style resolution without loading WASM. VS Code uses the same reader for saved files; project values override corresponding editor settings and config edits are picked up on the next format. Untitled documents retain editor settings. Executable module configs require VS Code workspace trust; JSON remains available without it. The Worker cache includes both boolean options, so configuration changes cannot reuse a result with different options.

## Upstream alignment

The baseline is **ktfmt 0.65**, commit `adee029cb742e37a30889fb4e32516da6bd658c6`, with **google-java-format 1.23.0**, commit `f1f68745375921b898a3b9f588ca94528b374e75`. `kotlin-format/upstream` contains only metadata with versions, commits, source paths and file checksums. The test dependency versions are read from that metadata. Original source trees and test resources are not checked in; the adapted production code remains under `src/commonMain`. [Source synchronization and attribution](upstream-sources.md) describes the shared downloader and consolidated license text.

The adapted `upstream/visitor`, KDoc and cleanup rules follow ktfmt's source structure. `Psi*.kt` provides portable tree access. `Engine.kt`, `Layout.kt` and `LayoutOutput.kt` port KotlinInput plus google-java-format's OpsBuilder, DocBuilder, Doc, Indent and whole-document JavaOutput behavior. Java-specific AST traversal is not used. Import-use detection reads syntax references and KDoc links rather than compiler-resolved symbols.

Both modules use the Kotlin version in `gradle/libs.versions.toml` for the KMP compiler, standard library and tests. The formatter's `jvmTest` also explicitly depends on `libs.kotlin.compiler`, with a strict version from the same catalog entry. This replaces ktfmt 0.65's transitive Kotlin compiler 2.4.10 with the project's 2.4.21 syntax target, including its compiler support artifacts. A JVM test checks the loaded reference compiler and Kotlin runtime versions against the catalog version.

`jvmTest` runs the original Maven ktfmt formatter artifact with that project-aligned compiler as the reference implementation on a normal JDK. It therefore tests ktfmt's formatting rules on the project's syntax target, rather than the exact dependency combination of the upstream distribution. “Oracle” in test paths means a reference result, not Oracle-branded Java. No JVM vendor is required. The source project uses JDK 21 for builds; extension users need no JVM.

All 540 upstream input files are exercised in all three stable styles (1,620 combinations), including their width/script/option directives. First and second formatting passes are compared with upstream. Of these combinations, 1,604 are idempotent; the remaining 16 also change on a second pass in ktfmt itself. Compatibility tests compare the actual second-pass result rather than claiming all upstream output is idempotent. Generated fixtures are replayed against the packaged WASM module. Separate seeded layout tests compare 400 operation/width combinations directly with google-java-format 1.23.0, covering nested levels, unified/independent/forced breaks and conditional indentation. These tests are evidence for the covered inputs, not a proof for every possible Kotlin source.

### Upstream non-idempotent behavior

Compatibility includes the pinned upstream formatter's known non-idempotent behavior: when upstream changes its own output on a second pass, this implementation reproduces both passes. It does not apply extra formatting passes until convergence or independently change those rules to enforce idempotency.

For the current baseline, the 16 non-idempotent combinations come from six input files across the three styles: 13 combinations involve comment wrapping, indentation or blank lines, and three involve semicolon indentation near comments in empty statement bodies. Five of these upstream files explicitly disable their idempotency check with `// CHECK_IDEMPOTENCY false`; the sixth is `format/annotation/multipleAnnotations.input` under `KOTLINLANG`. These are observed upstream stability limitations, not a requirement that formatting should generally take multiple passes.

The differential tests compare `portable(x)` with `upstream(x)` and then `portable(upstream(x))` with `upstream(upstream(x))`. The second comparison remains mandatory even for the non-idempotent cases. A VS Code user may consequently see another edit on a subsequent formatting request for these inputs. The cache preserves this behavior: caching `A → B` does not create an assumed `B → B` entry. When the upstream baseline is upgraded, its newly observed outputs become the reference for both passes.

## Updating the baseline

1. Check out the desired ktfmt commit in an ignored directory and inspect its pinned google-java-format dependency. Update the revisions/versions in `upstream/metadata.json` and its `files` manifest from the new commit's `.input` files under `ktfmt.casesPath`. Keys are relative to that directory; SHA-256 hashes use UTF-8 text with CRLF normalized to LF. Review license changes too. Gradle reads the dependency versions directly from this metadata.
2. Update the `referenceSources` paths/checksums for the selected revisions. Use `pnpm upstream:sync ktfmt google-java-format` to retrieve their sources for comparison. Compare changed ktfmt visitor, cleanup, import and KDoc code with the adapted files. Compare changed google-java-format layout classes with the three portable engine files; its Java AST visitors do not belong in the KMP module.
3. Run `pnpm --filter kotlin-format prepare:upstream`, then `node scripts/gradle.ts :kotlin-format:jvmTest`. Differences are written to `kotlin-format/build/oracle`; fix or explicitly assess behavior changes before accepting a new baseline. Fixture expectations are generated by the original dependency, never by the portable formatter.
4. Run `pnpm build`, `pnpm typecheck`, `pnpm test:built` and `pnpm test:extension`. Parser changes also run through the official parser differential tests in this suite. Update this baseline description after confirming the new results.

The shared Kotlin version is pinned in `gradle/libs.versions.toml`. Updating it changes both modules' build compiler and reference compiler; parser source snapshots still follow the [parser upgrade procedure](upstream-upgrade.md). Updating ktfmt does not automatically change the shared Kotlin target. Compatibility with the selected ktfmt artifact is checked by the differential suite.

## Downloaded test resources

`jvmTest` depends on `prepareUpstreamCases`, so both direct Gradle tests and `pnpm test:built` prepare the corpus automatically. The shared downloader uses Node and `tar`, downloads a source archive for the full commit ID, and retains only the 540 manifest-listed `.input` files in root `build/upstream/ktfmt/<commit>/cases`. It verifies every input against the checked-in checksums. The 129 unused upstream `.output` files are not retained as extracted resources.

The archive and extracted inputs are inside root `build/`, already excluded by `.gitignore`. A complete verified cache works offline; missing inputs can be restored from the cached archive without downloading it again. A modified input fails checksum validation instead of silently changing the reference corpus. Remove the affected cached file and rerun to restore it. Changing the commit selects a separate cache directory. Cleaning an individual module does not remove the shared cache.

`pnpm upstream:sync ktfmt-cases` (or `pnpm --filter kotlin-format prepare:upstream`) can prefetch or explicitly verify the cache. Normal JVM/WASM production compilation and extension packaging do not need the test corpus or upstream source downloads. The formatter distribution uses the repository's shared Apache-2.0 license; attribution is documented in [upstream sources](upstream-sources.md). The test asserts the manifest's input count to prevent an absent corpus from passing as zero test cases.
