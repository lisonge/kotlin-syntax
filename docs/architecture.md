# Architecture

This workspace separates the portable parser, its JVM reference tests, the WASM boundary and the VS Code integration.

## Modules

- `kotlin-parser/src/commonMain`: lexer, marker builder, immutable syntax trees, grammar parsing and incremental documents.
- `kotlin-parser/src/jvmTest`: official compiler adapters and differential tests. The compiler dependency is limited to this source set.
- `kotlin-parser/src/wasmJsMain`: exported document, parsing and highlighting APIs.
- `kotlin-vscode/src`: extension provider, Worker client, Worker runtime and token encoding.
- `benchmarks`: executable benchmarks and archived reports; see the [benchmark guide](../benchmarks/README.md).

## Parser and WASM API

The common Kotlin parser foundation now includes immutable syntax nodes, a marker builder (`mark`, `done`, `drop`, `precede`, `rollbackTo`, `collapse`, `doneBefore`, and error nodes), comment binding, newline state, and joined operator tokens. JVM tests compare marker trees and semantic adapter behavior with the pinned official compiler; common tests also run on WASM. This is the subset needed for the non-lazy parser, not a complete IntelliJ builder implementation.

The parser package exports `tokenize(source): string`, returning JSON tokens `{ kind, start, end }`. Offsets are UTF-16 code units; whitespace is retained. Incomplete strings can yield the official lexer's zero-length `DANGLING_NEWLINE` token. Token names are upstream constant names, not resolved symbols.

`parseFile(source): string` returns a JSON syntax tree with `{ kind, start, end, children, error }` on every node. It preserves whitespace/comments and zero-width error nodes. `error` is a message or `null`; the root kind is `KT_FILE`. Input is passed directly to the lexer without line-ending normalization.

`parseScript(source): string` uses the same JSON format and includes a `SCRIPT` node containing top-level statements. Both entry points parse syntax only; they do not resolve symbols or check Kotlin type correctness.

The WASM API exports `openDocument(source, script): number`, `documentTree(id): string`, `editDocument(id, start, end, replacement): string` and `closeDocument(id)`. Edit offsets address the current document in UTF-16 code units; `end` is exclusive. Close document handles when finished. Multiple edits expressed against one source snapshot must be applied from the highest offset downwards.

## Incremental documents

The incremental implementation retains immutable prefix nodes and reparses from the preceding top-level declaration to EOF. It requires at least two declarations strictly before the edit and an error-free prior tree. Preamble edits, scripts and previously damaged trees use full parsing. This is conservative incremental parsing, not arbitrary subtree reparsing or incremental lexing; edits near the beginning or inside a large first declaration can still reparse the entire file. The common JVM/WASM suite compares insertion, deletion, replacement and sequential-edit results with fresh parsing, and verifies prefix-node reuse.

## Highlighting data flow

Editor document snapshot → ParserClient queue → Node Worker → WASM document update → compact highlight spans → per-line token encoding → transferable Uint32Array → VS Code semantic tokens.

The extension classifies syntax through VS Code's semantic token API. Multiline spans are split into valid per-line tokens. Document versions, edits at multiple offsets, cancellation checks, delta result IDs and closing documents are handled. The extension host sends source snapshots to a single Worker; it keeps one running request plus the newest queued snapshot per document and discards obsolete results. The Worker derives one replacement from consecutive snapshots, retains parser document handles, and transfers encoded token buffers back to the host. Closing a document drops its cache, and disposal terminates the Worker. Cancellation discards results and queued work; it cannot interrupt a synchronous WASM parse that is already running. Classification is syntactic: an unresolved reference cannot reliably be identified as a class, function or property solely from its spelling.

`applyDocumentEdit(id, start, end, replacement): void` updates a document without serializing its tree. `documentHighlights(id): string` returns a compact JSON array repeating `[start, end, tokenTypeIndex, modifierBits]`; token IDs match the extension legend. The existing tree APIs remain available for tooling/tests. The extension hot path uses compact spans, splits multiline tokens inside the Worker, and transfers a `Uint32Array` buffer. It no longer serializes two full syntax trees per edit. The WASM boundary still uses compact JSON; only the Worker-to-host buffer is transferred.

The legacy classifier in `kotlin-vscode/src/highlights.ts` remains a reference for differential testing and benchmarks. `protocol.ts` encodes compact spans; `parser-worker.ts` owns the WASM document handles.

## Build and native TypeScript

Handwritten source, development scripts and tests use TypeScript with explicit `.ts` source imports. Node runs development scripts directly. The extension release build uses `tsconfig.build.json` to emit ESM JavaScript and rewrite relative imports to `.js`; its entry is `dist/extension.js`, and its Worker loads `parser-worker.js`. Kotlin-generated `.mjs` glue and WASM are copied alongside the emitted code. Declaration files support local test/benchmark typechecking but are excluded from VSIX packaging.

`tsconfig.base.json` supplies shared strict checking and native-TypeScript constraints. `pnpm typecheck` does not emit; the extension build configuration overrides `noEmit` and enables `rewriteRelativeImportExtensions`. The package remains `type: module`. The editor version requirement remains unchanged; this packaging change does not establish compatibility with older editor releases.

`pnpm-lock.yaml` locks the workspace packages. `kotlin-js-store/wasm/package-lock.json` is the separate Kotlin Gradle plugin test-harness lockfile; it does not manage the workspace packages.

Detailed validation commands are in [testing.md](testing.md); grammar boundaries are in [compatibility.md](compatibility.md).

Syntax-only classification distinguishes enum and annotation declarations, member methods, labels, constructor properties and local variables. Declaration modifiers include `readonly` for `val`, explicit `abstract`, and `async` for `suspend`; KDoc spans carry `documentation`. These modifiers do not imply symbol resolution: reference mutability, deprecation and standard-library membership are not inferred. Script-root declarations are properties even though the parser wraps them in a block.
