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

The [CI and release workflow](../.github/workflows/release.yml) runs on branch pushes, pull requests and `v*` tags on Windows and Ubuntu. It checks that lexer regeneration leaves no diff, builds once, typechecks and runs `pnpm test:built`. Linux packages and validates the VSIX before uploading it. Tag/version validation and publishing run only for `v*` tags; branch and PR runs need no publishing credentials. It currently does not run the installed-editor host test or enforce performance thresholds.

## Performance checks

See [benchmarks/README.md](../benchmarks/README.md) for benchmark commands, baseline requirements, environment overrides and report locations. Low-sample runs validate execution and output equality only; they are not performance regression evidence. Historical measurements remain under `benchmarks/reports/`, while new output defaults to `build/benchmarks/`.

Independent hand-authored highlight expectations live in `kotlin-vscode/test/highlight-cases.ts` and the common Kotlin `HighlightTest`. They cover declarations/modifiers, malformed and unfinished code, kt/kts documents and sequential replacement/recovery. Worker tests additionally walk character prefixes and delete back to empty; extension-host tests replay the hand-authored cases and typing transitions through real document edits. These checks supplement classifier-to-classifier equality with expected token categories and modifier bits.

To test a packaged installation, set `VSCODE_TEST_VSIX` to the VSIX path and run `pnpm test:extension`. The runner installs it through the VS Code CLI into a fresh isolated profile, uses a separate empty development harness, and asserts that the target extension loads from the isolated installation directory before testing highlighting. It does not install into the user's normal profile.

Worker fault tests cover startup failure, exit, timeouts with queued work, the consecutive-failure circuit breaker, manual reset, disposal and recovery. The extension-host suite also invokes the log and restart commands before checking tokens.

## Releases

Update `kotlin-vscode/package.json` before tagging. Push a tag matching `v<version>` (for example `v0.0.2`); mismatched tags fail validation. `.github/workflows/release.yml` runs generation checks, build, typechecking and JVM/WASM/Worker tests on Linux and Windows. Linux packages the VSIX, validates its publisher, license metadata and required license asset once, and uploads it as a workflow artifact. Only after both jobs pass does the publish job upload that artifact to a GitHub Release and publish it. Test reports are uploaded even on failures. Three independent publishing jobs consume the same VSIX artifact: GitHub Releases, VS Code Marketplace and Open VSX. Each runs only for version tags and depends on the test matrix, including the shared package validation; a failure in one publishing job does not block the others. The workflow uses the repository's `GITHUB_TOKEN` with write permission only in the publish job. Installed-editor host tests remain a local validation step.

### Marketplace setup

In repository Settings → Secrets and variables → Actions, add `VSCE_PAT` (Azure DevOps PAT with Marketplace Manage permission and access to the publisher) and `OVSX_PAT` (Open VSX personal access token with permission to publish into the namespace). Missing credentials fail the corresponding job explicitly; they do not silently skip publishing. Tokens are passed as environment variables only in publishing steps.

The configured publisher is `lisonge`, and the extension ID is `lisonge.kotlin-vscode`. Ensure your Marketplace publisher and Open VSX namespace both use `lisonge`, with the required account permissions and publisher agreement. The same VSIX is used in both markets. Project license and repository metadata are configured as Apache-2.0 and https://github.com/lisonge/vscode-kotlin-syntax. No publisher secret or workflow variable is needed.

Publish by pushing a matching version tag after committing these changes. If one market fails, rerun only failed jobs after fixing credentials or permissions. Already published versions generally cannot be overwritten; for code or manifest changes, bump the version and create a new tag. `GITHUB_TOKEN` is provided by Actions automatically for the GitHub Release job. The workflow does not create marketplace accounts or namespaces.

### Release notes

`kotlin-vscode/CHANGELOG.md` contains only the current release, headed `# What's Changed` and `## <package version>`. Replace the previous version's entries when preparing a release. Tag validation checks the version heading and nonempty change entries. The file is included in the shared VSIX; the GitHub publish job extracts that exact file from the artifact and supplies it as release notes, including on reruns. Marketplace and Open VSX receive the same changelog inside the same package.

### First-publication status

The extension manifest includes category, keywords, publisher, repository, homepage, issue tracker and Apache-2.0 license metadata. The VSIX includes the project LICENSE containing the Apache-2.0 license text (`vsce` packages it as `LICENSE.txt`). The shared package check accepts `LICENSE`, `LICENSE.txt` or `LICENSE.md`, and also checks the named asset when the manifest uses `SEE LICENSE IN ...`. Packaging no longer bypasses missing-repository or license checks. Marketplace account permissions and GitHub Secrets must still be configured by the owner. An icon and screenshots are optional listing improvements. The editor requirement remains at the tested version.

As of 2026-10-24, VS Code's official publishing guide announces retirement of global Azure DevOps PATs on 2026-12-01 and recommends Microsoft Entra identity-based publishing. The current workflow still uses `VSCE_PAT`; configure an appropriate identity and migrate the job before that deadline. Open VSX also supports trusted publishing, but this workflow currently uses `OVSX_PAT`.
