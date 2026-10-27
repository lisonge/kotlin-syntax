# Testing

Use the runtime versions in [package.json](../package.json), JDK 21 and the checked-in Gradle Wrapper. Install dependencies with `pnpm install --frozen-lockfile`.

## Full validation

```sh
pnpm build
pnpm typecheck
pnpm test:built
pnpm test:extension
```

`pnpm test` builds the parser and extension once, then runs `pnpm test:built`: JVM and WASM Gradle tests, JVM-verified fixture replay against packaged WASM, and extension bundle/Worker tests. Use `pnpm test:built` only after a current `pnpm build`; it deliberately reuses existing assets. `pnpm typecheck` requires generated build assets, so run `pnpm build` first on a clean checkout.

## Focused validation

Formatting checks and upstream upgrade steps are described in [Kotlin formatting](formatting.md). `pnpm test:built` includes formatter JVM/WASM tests and packaged WASM replay of ktfmt-generated fixtures. Extension Worker tests cover formatting, malformed input, cancellation and disposal; the real extension-host suite checks `.kt` and `.kts` Format Document edits.

Formatter cache tests count messages to a real Worker: repeated inputs and shared pending requests avoid additional calls, while source/style/width/script changes and document reopening require computation. Tests also cover independent cancellation, errors, Worker restart, close/disposal, latest-request selection, and a real ktfmt example whose second pass changes the output.

`pnpm --filter kotlin-format test:cli` runs the built Node CLI against temporary projects: stdin and scripts, write/check exit codes, nested gitignore, native JSON/JS/MJS/TS discovery and overrides, module reloads and relative imports, invalid input, standalone distribution loading, and upstream non-idempotence. It is included in `test:built`. The formatter owns `kotlin-format/tsconfig.json`; its typecheck is included in the root command. Installed-editor tests also verify module configuration, native TS loading and cache invalidation after configuration edits.

| Change | Validation |
|---|---|
| Lexer, builder, grammar or incremental parsing | `pnpm test` |
| WASM exports, spans, Worker protocol or extension behavior | `pnpm test`, `pnpm typecheck`, `pnpm test:extension` |
| TypeScript scripts or benchmark paths | `pnpm typecheck` and the affected command |
| Lexer generator or upstream lexer | `pnpm generate`, inspect generated diff, then `pnpm test` |

For focused Gradle execution, use `node scripts/gradle.ts :kotlin-parser:jvmTest :kotlin-parser:wasmJsNodeTest`. Gradle may report unchanged tests as `UP-TO-DATE`; append `--rerun-tasks` when a fresh execution is needed.

## Differential evidence

JVM tests compare lexer tokens, marker/trivia behavior and complete parser trees against the unmodified official compiler. Comparisons cover UTF-16 ranges, trivia, errors, malformed prefixes, scripts and handwritten common Kotlin sources. The generated fixtures live in `kotlin-parser/build/oracle/`; `pnpm --filter kotlin-parser test:bundle` consumes them after JVM tests and a parser build. Common tests exercise incremental edits and prefix reuse on JVM and WASM. Worker tests also compare compact highlights with the legacy classifier.

## Extension host

`pnpm test` includes JVM/WASM tests, official fixture replay and extension bundle tests. `pnpm test:extension` runs the built extension in an isolated installed VS Code test host; run `pnpm build` first. On Windows the runner locates `code.cmd` from PATH; elsewhere, or to test another installation, set `VSCODE_EXECUTABLE_PATH` to the editor executable. It verifies activation, actual WASM loading, classifications, multiline token ranges, edits and Kotlin scripts. The result is written to `kotlin-vscode/build/host-result.json`. Tests use separate profile/extension directories under `build`.

Extension-host tests now create a unique portable-data directory for every invocation and explicitly set `VSCODE_PORTABLE`. This handles installations where portable mode overrides the ordinary `--user-data-dir` and `--extensions-dir` options, as described in the [VS Code portable-mode documentation](https://code.visualstudio.com/docs/setup/portable). The runner does not close existing editor instances.

## Generated files and CI

`pnpm generate` deterministically regenerates the common Kotlin lexer tables/actions from the checksum-verified cache under root `build/upstream/parser/<commit>/sources/`. It automatically downloads missing sources pinned by `kotlin-parser/upstream/metadata.json` and verifies their hashes before writing outputs; the generated attribution header uses the metadata version. Generated Kotlin sources are committed, so ordinary production builds do not download upstream sources or generate the lexer first. See [upstream synchronization](upstream-sources.md) for prefetching and offline cache use.

The [CI workflow](../.github/workflows/ci.yml) runs on branch pushes and pull requests on ubuntu-latest, while the separate [release workflow](../.github/workflows/release.yml) runs independently on version tags. It checks that lexer regeneration leaves no diff, builds once, typechecks and runs `pnpm test:built`. The release job packages the VSIX with vsce and attaches it directly to GitHub Releases. Tag/version validation and publishing run only for `v*` tags; branch and PR runs need no publishing credentials. It currently does not run the installed-editor host test or enforce performance thresholds.

## Performance checks

See [benchmarks/README.md](../benchmarks/README.md) for benchmark commands, baseline requirements, environment overrides and report locations. Low-sample runs validate execution and output equality only; they are not performance regression evidence. Historical measurements remain under `benchmarks/reports/`, while new output defaults to `build/benchmarks/`.

Independent hand-authored highlight expectations live in `kotlin-vscode/test/highlight-cases.ts` and the common Kotlin `SyntaxClassificationTest`. They cover declarations/modifiers, malformed and unfinished code, kt/kts documents and sequential replacement/recovery. Worker tests additionally walk character prefixes and delete back to empty; extension-host tests replay the hand-authored cases and typing transitions through real document edits. These checks supplement classifier-to-classifier equality with expected token categories and modifier bits.

To test a packaged installation, set `VSCODE_TEST_VSIX` to the VSIX path and run `pnpm test:extension`. The runner installs it through the VS Code CLI into a fresh isolated profile, uses a separate empty development harness, and asserts that the target extension loads from the isolated installation directory before testing highlighting. It does not install into the user's normal profile.

Set `VSCODE_TEST_WORKSPACE=1` to also create an isolated workspace and verify explicit-import navigation across files, aliases, overloads, file-private exclusions, duplicate qualified names, unsaved edits, file creation/deletion/rename, omitted package prefixes, string filtering before parsing and reuse of cached summaries. When testing the Dev VSIX, set `VSCODE_TEST_MANIFEST` to the absolute path of `kotlin-vscode/build/dev-extension/package.json` so the host targets the Dev identity.

Worker fault tests cover startup failure, exit, timeouts with queued work, the consecutive-failure circuit breaker, manual reset, disposal and recovery. The extension-host suite also invokes the log and restart commands before checking tokens.

## Releases

Update `kotlin-vscode/package.json`, `kotlin-format/package.json` and `kotlin-parser/package.json` to the same version before tagging. Push `v<version>` (for example `v0.0.7`). `scripts/release-version.ts` rejects mismatched package versions, mismatched tags and private formatter/parser packages. The existing `.github/workflows/release.yml` builds and tests the workspace, packages the VSIX and runs `pnpm pack` for the formatter. The packed manifest is checked for unresolved catalog/workspace references, and its CLI is tested after extraction without workspace dependencies.

The workflow publishes from the formatter package with `pnpm -F kotlin-format publish --no-git-checks`, then attaches only `kotlin-syntax-<version>.vsix` to the GitHub Release. The formatter is distributed through npm; the separate pack step only validates its archive before publication. pnpm resolves catalog references during both packing and publishing. Plugin dependencies are declared at the workspace root. CI and release package directly from `kotlin-vscode` with `--no-dependencies --changelog-path dist/CHANGELOG.md`; only Dev packaging uses a staging directory to change the extension identity. The parser is also published with `pnpm -F kotlin-parser publish --no-git-checks` before the formatter. Test reports are uploaded even on failure. Marketplace upload remains manual.

Publishing uses pnpm 12's native OIDC support with the release job's `id-token: write`; no npm CLI or long-lived token secret is used. Configure both npm packages' GitHub Trusted Publishers with owner `lisonge`, repository `kotlin-syntax`, workflow filename `release.yml`, and permission to publish directly. No GitHub environment is configured by this workflow. The npm package/account and trusted-publisher relationship must be set up externally before running the release; local tests cannot verify registry ownership or OIDC authentication. See [npm trusted publisher setup](https://docs.npmjs.com/trusted-publishers/) and [pnpm OIDC support](https://pnpm.io/blog/releases/12.15.0). GitHub Release uses the automatic `GITHUB_TOKEN`.

The workflow uses `--no-git-checks` because publication runs from a tag checkout. npm-registry publication and GitHub publication are separate operations: if pnpm publishes successfully but the later GitHub Release step fails, recover the GitHub Release using the already published version rather than republishing it.

Local release checks (after building): `node --test scripts/test/release-version.ts`, `RELEASE_TAG=v<version> node scripts/release-version.ts`, `pnpm --filter kotlin-format pack --pack-destination build`, and `node scripts/test-format-package.ts`. These commands do not publish anything.

### Manual Marketplace upload

For a step-by-step walkthrough in Chinese, see [VS Code Marketplace publishing](marketplace-publishing.zh-CN.md).

The configured publisher is `lisonge`, and the extension ID is `lisonge.kotlin-vscode`. Create or select that Publisher in the Marketplace management portal, then upload the VSIX downloaded from GitHub Releases. You can also package the VSIX locally using the walkthrough. No Marketplace token or GitHub Secret is needed for manual upload.

Pushing a matching version tag creates a GitHub Release; it does not publish to Marketplace. The release job uses the automatically provided `GITHUB_TOKEN`. For an extension update, increment the manifest version, update the changelog, build a new VSIX and upload it through the existing Marketplace extension's update action.

### Release notes

`CHANGELOG.md` contains only the current release, headed `# What's Changed` and `## <package version>`. Replace the previous version's entries when preparing a release. Tag validation checks that the release tag matches the extension, formatter and parser package versions. The file is included in the shared VSIX; the release job uses the changelog checked out from the same release tag as its release notes. Marketplace receives the same changelog inside the VSIX package.

### First-publication status

The extension manifest includes category, keywords, publisher, repository, homepage, issue tracker, a 256×256 PNG icon, dark gallery banner, free pricing and Apache-2.0 license metadata. The VSIX includes the project LICENSE containing the Apache-2.0 license text (`vsce` packages it as `LICENSE.txt`) and the README linking to the actual playground screenshot hosted on GitHub. Packaging no longer bypasses missing-repository or license checks. The owner must have permission to upload under the configured Marketplace publisher. The minimum editor version is VS Code 1.117.0, matching the six-month compatibility baseline selected on 2026-10-25.

Incremental transport tests cover descending multi-range edits, composed CodeMirror changes, cancelled and superseded requests, bounded backlogs, stale base versions, snapshot recovery and 800 deterministic random UTF-16 edits. The extension-host test writes a file outside the editor and explicitly reloads it from disk, then checks classification and parser-restart recovery. This verifies synchronization after the editor accepts disk changes; it does not test automatic file watching.
