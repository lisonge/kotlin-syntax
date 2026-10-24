# Architecture

Kotlin Syntax centers on a portable Kotlin Multiplatform parser. The VS Code extension and online playground are consumers of the same library.

## Modules

- `kotlin-parser/src/commonMain`: lexer, marker builder, immutable syntax trees, grammar parsing and incremental documents.
- `kotlin-parser/src/jvmTest`: official compiler adapters and differential tests. The compiler dependency is limited to this source set.
- `kotlin-parser/src/wasmJsMain`: exported document, parsing and syntax classification APIs.
- `kotlin-parser/js`: shared token legend and source replacement calculation, exported from the lightweight `kotlin-parser/shared` entry and copied into the extension package with the parser assets.
- `kotlin-vscode/src`: extension provider, Worker client, Worker runtime and token encoding.
- `kotlin-website/src`: React playground and browser Worker. Theme preparation resolves the vendored One Dark Pro rules into deduplicated styles before Vite builds the site.
- `benchmarks`: executable benchmarks and archived reports; see the [benchmark guide](../benchmarks/README.md).

## Kotlin API

`tokenize` returns `List<Token>`; `parseFile` and `parseScript` return `SyntaxNode`. `SyntaxNode.classifySyntax()` returns `List<SyntaxClassification>` with `TokenType` and `Set<TokenModifier>`. `IncrementalDocument` keeps native Kotlin document state. Android and JVM consumers use these objects directly; JSON is only needed at serialization boundaries. See [Kotlin and Android integration](kotlin-api.md).

## JavaScript entry

`kotlin-parser/shared` exports `tokenTypes`, `tokenModifiers` and `replacement`, built with tsdown. Importing this entry does not load WASM. The root `kotlin-parser` entry re-exports both shared utilities and the WASM API for consumers that do not need a Worker; importing it initializes WASM. The separate `kotlin-parser/wasm` subpath exposes the generated Kotlin module; use a static import or `await import('kotlin-parser/wasm')` for on-demand loading. Parsing/document methods remain synchronous after module initialization. Repeated imports reuse the module in the same JS environment; each Worker has its own instance. The website Worker imports `kotlin-parser/wasm` directly. Vite tracks the generated modules and emits the referenced WASM asset with the Worker build.

## WASM API

The common Kotlin parser foundation now includes immutable syntax nodes, a marker builder (`mark`, `done`, `drop`, `precede`, `rollbackTo`, `collapse`, `doneBefore`, and error nodes), comment binding, newline state, and joined operator tokens. JVM tests compare marker trees and semantic adapter behavior with the pinned official compiler; common tests also run on WASM. This is the subset needed for the non-lazy parser, not a complete IntelliJ builder implementation.

The parser package exports `tokenize(source): string`, returning JSON tokens `{ kind, start, end }`. Offsets are UTF-16 code units; whitespace is retained. Incomplete strings can yield the official lexer's zero-length `DANGLING_NEWLINE` token. Token names are upstream constant names, not resolved symbols.

`parseFile(source): string` returns a JSON syntax tree with `{ kind, start, end, children, error }` on every node. It preserves whitespace/comments and zero-width error nodes. `error` is a message or `null`; the root kind is `KT_FILE`. Input is passed directly to the lexer without line-ending normalization.

`parseScript(source): string` uses the same JSON format and includes a `SCRIPT` node containing top-level statements. Both entry points parse syntax only; they do not resolve symbols or check Kotlin type correctness.

The WASM API exports `openDocument(source, script): number`, `documentTree(id): string`, `editDocument(id, start, end, replacement): string` and `closeDocument(id)`. Edit offsets address the current document in UTF-16 code units; `end` is exclusive. Close document handles when finished. Multiple edits expressed against one source snapshot must be applied from the highest offset downwards.

## Incremental documents

The incremental implementation retains immutable prefix nodes and reparses from the preceding top-level declaration to EOF. It requires at least two declarations strictly before the edit and an error-free prior tree. Preamble edits, scripts and previously damaged trees use full parsing. This is conservative incremental parsing, not arbitrary subtree reparsing or incremental lexing; edits near the beginning or inside a large first declaration can still reparse the entire file. The common JVM/WASM suite compares insertion, deletion, replacement and sequential-edit results with fresh parsing, and verifies prefix-node reuse.

## Highlighting data flow

Editor changes (snapshot for initialization/recovery) → ParserClient queue → Node Worker → WASM document update → compact syntax classifications → per-line token encoding → transferable Uint32Array → VS Code semantic tokens.

The extension classifies syntax through VS Code's semantic token API. Multiline spans are split into valid per-line tokens. Document versions, edits at multiple offsets, cancellation checks, delta result IDs and closing documents are handled. The extension host sends versioned edit batches to a single Worker. It keeps one running request plus the newest queued result request per document, while retaining the intervening edits even when requests are superseded or cancelled. Batch ranges use pre-edit UTF-16 offsets and are sorted in descending order; batches are applied chronologically. The Worker combines them into one enclosing replacement before parsing and returns the target version with the encoded tokens. Initial documents, mode changes, missed change notifications and Worker restarts use full snapshots. A mismatched base version requests snapshot resynchronization without applying the edits. More than 64 unsent batches discard the edit history in favor of the latest snapshot. The host still captures document text for recovery, but normal edit messages do not carry it. Closing a document drops its cache, and disposal terminates the Worker. Cancellation discards results and queued work; it cannot interrupt a synchronous WASM parse that is already running. Classification is syntactic: an unresolved reference cannot reliably be identified as a class, function or property solely from its spelling.

`applyDocumentEdit(id, start, end, replacement): void` updates a document without serializing its tree. `documentClassifications(id): Int32Array` returns a new native JS typed array repeating `[start, end, tokenTypeIndex, modifierBits]`; token IDs follow the Kotlin `TokenType` order. `tokenLegend()` exports the type and modifier names; the JS build generates its legend from that export. The existing JSON tree APIs remain available for tooling/tests. The WASM export fills the typed array directly, without JSON serialization or parsing. The website Worker transfers its buffer to the main thread. The extension splits multiline spans and transfers encoded `Uint32Array` tokens, retaining its existing cache. Transferring the returned classification buffer detaches that JS array without affecting the Kotlin document; later calls return independent buffers. The generated TypeScript return declaration is corrected during the build because Kotlin/Wasm exports `JsAny` as `NonNullable<unknown>`.

The website composes pending CodeMirror ChangeSets while its Worker is busy, then sends descending edit ranges with base/target versions. It materializes the full source only for initialization, mode changes or recovery. Its Worker also parses one enclosing replacement per request and transfers the classification buffer. Both consumers retain the current editor document as the source of truth; external disk changes enter through editor document-change events.

The legacy classifier in `kotlin-vscode/test/legacy-highlights.ts` remains a reference for differential testing and benchmarks. `protocol.ts` encodes compact spans; `parser-worker.ts` owns the WASM document handles.

Classification is collected internally into a growable `IntArray` of four integers per span. The WASM export copies those integers into its returned JS typed array without creating `SyntaxClassification` objects or modifier sets. The public Kotlin `classifySyntax()` API materializes its existing objects from the same integer results; modifier sets are created only for nonzero masks. This keeps one classification implementation and the same result fields and wire format.

## Build and native TypeScript

Handwritten source, development scripts and tests use TypeScript with explicit `.ts` source imports. Node runs development scripts directly. The extension release build uses tsdown to bundle ESM JavaScript with fixed `dist/extension.js` and `dist/parser-worker.js` entries. Auxiliary `parser-client`, `protocol` and `highlights` entries preserve the built-code imports used by tests and benchmarks. Shared parser utilities are bundled; `vscode`, Node built-ins and the Kotlin WASM module remain external. Kotlin-generated `.mjs` glue, WASM and their declarations are copied into `dist/parser/`. Declaration files support local test/benchmark typechecking but are excluded from VSIX packaging.

`tsconfig.base.json` supplies shared strict checking and native-TypeScript constraints. `pnpm typecheck` uses TypeScript without emitting; tsdown generates JavaScript and uses Oxc for declaration output. The package remains `type: module`. The editor version requirement remains unchanged; this packaging change does not establish compatibility with older editor releases.

`pnpm-lock.yaml` locks the workspace packages. `kotlin-js-store/wasm/package-lock.json` is the separate Kotlin Gradle plugin test-harness lockfile; it does not manage the workspace packages.

Detailed validation commands are in [testing.md](testing.md); grammar boundaries are in [compatibility.md](compatibility.md).

Syntax-only classification distinguishes enum and annotation declarations, member methods, labels, constructor properties and local variables. Declaration modifiers include `readonly` for `val`, explicit `abstract`, and `async` for `suspend`; KDoc spans carry `documentation`. These modifiers do not imply symbol resolution: reference mutability, deprecation and standard-library membership are not inferred. Script-root declarations are properties even though the parser wraps them in a block.
