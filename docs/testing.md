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

`pnpm generate` deterministically regenerates the common Kotlin lexer tables/actions from the checksum-verified source in `kotlin-parser/upstream`. Before writing outputs, it verifies the lexer and every parser source listed in `metadata.json`; the generated attribution header uses the metadata version. Generated Kotlin sources are committed so ordinary Gradle builds do not require Node to generate sources first.

The [CI workflow](../.github/workflows/ci.yml) runs on branch pushes and pull requests on ubuntu-latest, while the separate [release workflow](../.github/workflows/release.yml) runs independently on version tags. It checks that lexer regeneration leaves no diff, builds once, typechecks and runs `pnpm test:built`. The release job packages the VSIX with vsce and attaches it directly to GitHub Releases. Tag/version validation and publishing run only for `v*` tags; branch and PR runs need no publishing credentials. It currently does not run the installed-editor host test or enforce performance thresholds.

## Performance checks

See [benchmarks/README.md](../benchmarks/README.md) for benchmark commands, baseline requirements, environment overrides and report locations. Low-sample runs validate execution and output equality only; they are not performance regression evidence. Historical measurements remain under `benchmarks/reports/`, while new output defaults to `build/benchmarks/`.

Independent hand-authored highlight expectations live in `kotlin-vscode/test/highlight-cases.ts` and the common Kotlin `SyntaxClassificationTest`. They cover declarations/modifiers, malformed and unfinished code, kt/kts documents and sequential replacement/recovery. Worker tests additionally walk character prefixes and delete back to empty; extension-host tests replay the hand-authored cases and typing transitions through real document edits. These checks supplement classifier-to-classifier equality with expected token categories and modifier bits.

To test a packaged installation, set `VSCODE_TEST_VSIX` to the VSIX path and run `pnpm test:extension`. The runner installs it through the VS Code CLI into a fresh isolated profile, uses a separate empty development harness, and asserts that the target extension loads from the isolated installation directory before testing highlighting. It does not install into the user's normal profile.

Worker fault tests cover startup failure, exit, timeouts with queued work, the consecutive-failure circuit breaker, manual reset, disposal and recovery. The extension-host suite also invokes the log and restart commands before checking tokens.

## Releases

Update `kotlin-vscode/package.json` before tagging. Push a tag matching `v<version>` (for example `v0.0.2`); mismatched tags fail validation. `.github/workflows/release.yml` runs only on `v*` tag pushes. Its single release job validates the tag and runs generation checks, build, typechecking and JVM/WASM/Worker tests on ubuntu-latest. After these checks pass, the same job packages the VSIX as `kotlin-syntax-<version>.vsix` (for example `kotlin-syntax-0.0.2.vsix`), attaches the local file directly to a GitHub Release. Test reports are uploaded even on failures. Marketplace publication is a separate manual upload. The workflow uses the repository's `GITHUB_TOKEN` with write permission in the release job. Installed-editor host tests remain a local validation step.

### Manual Marketplace upload

For a step-by-step walkthrough in Chinese, see [VS Code Marketplace publishing](marketplace-publishing.zh-CN.md).

The configured publisher is `lisonge`, and the extension ID is `lisonge.kotlin-vscode`. Create or select that Publisher in the Marketplace management portal, then upload the VSIX downloaded from GitHub Releases. You can also package the VSIX locally using the walkthrough. No Marketplace token or GitHub Secret is needed for manual upload.

Pushing a matching version tag creates a GitHub Release; it does not publish to Marketplace. The release job uses the automatically provided `GITHUB_TOKEN`. For an extension update, increment the manifest version, update the changelog, build a new VSIX and upload it through the existing Marketplace extension's update action.

### Release notes

`kotlin-vscode/CHANGELOG.md` contains only the current release, headed `# What's Changed` and `## <package version>`. Replace the previous version's entries when preparing a release. Tag validation checks that the release tag matches the extension package version. The file is included in the shared VSIX; the release job uses the changelog checked out from the same release tag as its release notes. Marketplace receives the same changelog inside the VSIX package.

### First-publication status

The extension manifest includes category, keywords, publisher, repository, homepage, issue tracker, a 256×256 PNG icon, dark gallery banner, free pricing and Apache-2.0 license metadata. The VSIX includes the project LICENSE containing the Apache-2.0 license text (`vsce` packages it as `LICENSE.txt`) and the README linking to the actual playground screenshot hosted on GitHub. Packaging no longer bypasses missing-repository or license checks. The owner must have permission to upload under the configured Marketplace publisher. The minimum editor version is VS Code 1.117.0, matching the six-month compatibility baseline selected on 2026-10-25.

Incremental transport tests cover descending multi-range edits, composed CodeMirror changes, cancelled and superseded requests, bounded backlogs, stale base versions, snapshot recovery and 800 deterministic random UTF-16 edits. The extension-host test writes a file outside the editor and explicitly reloads it from disk, then checks classification and parser-restart recovery. This verifies synchronization after the editor accepts disk changes; it does not test automatic file watching.
