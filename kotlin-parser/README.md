# kotlin-parser

A Kotlin parser powered by WebAssembly, with syntax trees, incremental document updates and syntax-based semantic token classification. No JVM or Kotlin installation is required at runtime.

## Installation

```sh
pnpm add kotlin-parser
```

The package is ESM-only and includes TypeScript declarations. Node.js usage is tested with Node 26.12.1. Browser consumers need a modern engine supporting Kotlin/Wasm (including Wasm GC); the project's Vite playground demonstrates browser and Worker integration.

## Parse Kotlin source

```js
import { tokenize, parseFile, parseScript } from 'kotlin-parser/wasm';

const source = 'val answer = 42';
const tokens = JSON.parse(tokenize(source));
const tree = JSON.parse(parseFile(source));
const scriptTree = JSON.parse(parseScript('println(42)'));

console.log(tokens, tree, scriptTree);
```

These APIs return JSON strings. Tokens contain `kind`, `start` and `end`; tree nodes contain `kind`, `start`, `end`, `children` and `error`. Source offsets use UTF-16 code units, with exclusive end offsets. Whitespace and comments are retained. Use `parseFile` for `.kt` and `parseScript` for `.kts`.

Importing `kotlin-parser/wasm` initializes the WASM module; its functions are synchronous afterward. For lazy initialization:

```js
const parser = await import('kotlin-parser/wasm');
const tree = JSON.parse(parser.parseFile('class Example'));
```

## Incremental documents

```js
import {
  openDocument, editDocument, documentClassifications, closeDocument,
} from 'kotlin-parser/wasm';

const id = openDocument('val answer = 42', false); // false = .kt, true = .kts
try {
  const updatedTree = JSON.parse(editDocument(id, 13, 15, '43'));
  const spans = documentClassifications(id);
  // Int32Array records: [start, end, tokenTypeIndex, modifierBits].
  console.log(updatedTree, spans);
} finally {
  closeDocument(id);
}
```

Edits use offsets in the current document. `documentTree(id)` reads the current tree; `applyDocumentEdit(id, start, end, text)` updates it without serializing a tree. Close documents when no longer needed to release their retained state.

## Editor utilities

```js
import { tokenTypes, tokenModifiers, replacement } from 'kotlin-parser/editor';

const edit = replacement('val x = 1', 'val x = 2');
// { start: 8, end: 9, text: '2' }
console.log(tokenTypes, tokenModifiers, edit);
```

This lightweight entry does not load WASM. `tokenTypes` and `tokenModifiers` describe the classification records: the token index selects a token type, and bit `i` in the modifier mask selects `tokenModifiers[i]`. `replacement` computes one contiguous text replacement between two source snapshots.

There is no root export: import `kotlin-parser/wasm` or `kotlin-parser/editor` explicitly.

## Scope

The current syntax baseline is Kotlin 2.4.21. Parsing and classification are syntactic; this package does not perform compiler type checking or general symbol resolution. Additional exports provide document symbols and limited navigation. See the [architecture](https://github.com/lisonge/kotlin-syntax/blob/main/docs/architecture.md) and [tested compatibility scope](https://github.com/lisonge/kotlin-syntax/blob/main/docs/compatibility.md).

Apache-2.0. See [upstream attribution](https://github.com/lisonge/kotlin-syntax/blob/main/docs/upstream-sources.md). Report issues in the [project repository](https://github.com/lisonge/kotlin-syntax/issues).
