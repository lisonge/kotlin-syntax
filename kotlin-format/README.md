# kotlin-format

A Kotlin formatter aligned with ktfmt, powered by WebAssembly with a Node.js CLI. It formats `.kt` and `.kts` files without a JVM, Gradle or Kotlin installation. The parser is included in the WASM build; installing `kotlin-parser` separately is unnecessary.

## Installation

```sh
pnpm add -D kotlin-format
```

The package is ESM-only and includes TypeScript declarations. The CLI and native TypeScript configuration loading are tested with Node 26.12.1.

## Command line

```sh
# Rewrite Kotlin files in a directory.
pnpm exec kotlin-format src --write

# Check formatting in CI without rewriting files.
pnpm exec kotlin-format . --check

# Select a style and line width.
pnpm exec kotlin-format "src/**/*.kt" --style KOTLINLANG --max-width 120 --write

# Print a formatted file to stdout.
pnpm exec kotlin-format src/Main.kt

pnpm exec kotlin-format --help
```

The CLI accepts files, directories and glob patterns. Directory scans respect nested `.gitignore` rules and skip symlinks, `.git` and `node_modules`. With `--write` or `--check` and no paths, it scans the current directory. Without either flag, provide one file or pipe source through stdin.

For stdin, `--stdin-filepath` determines the configuration search location and whether to parse a script. For example, in a shell supporting input redirection:

```sh
pnpm exec kotlin-format --stdin-filepath src/Main.kt < src/Main.kt
```

Exit codes: **0** for success, **1** for formatting differences with `--check`, **2** for invalid arguments, configuration, source syntax or I/O errors. `--write` and `--check` cannot be combined.

## Configuration

Create `kotlin-format.json`:

```json
{
  "style": "KOTLINLANG",
  "maxWidth": 100,
  "removeUnusedImports": true,
  "preserveLambdaBreaks": true
}
```

Or use `kotlin-format.config.ts` with editor type checking:

```ts
import type { FormatConfig } from 'kotlin-format/config';

export default {
  style: 'KOTLINLANG',
  maxWidth: 120,
  removeUnusedImports: false,
  preserveLambdaBreaks: true,
} satisfies FormatConfig;
```

`kotlin-format.config.js` and `kotlin-format.config.mjs` are also supported. Module configs are ESM-only and must default-export an object. JS/TS follow Node's module rules; use `"type": "module"` in the project or `.mjs` for an explicit ESM entry. TS uses native type stripping, with no transpiler, tsconfig path aliases or runtime type checking. CommonJS, `.cjs` and JSONC are not supported.

| Option | Default | Values |
| --- | --- | --- |
| `style` | `KOTLINLANG` | `KOTLINLANG`, `GOOGLE`, `META` |
| `maxWidth` | `100` | Integer from 1 to 999 |
| `removeUnusedImports` | `true` | Boolean |
| `preserveLambdaBreaks` | `true` | Boolean |

Configuration is discovered per source file, searching upward to the nearest `package.json` or `.git` directory, or the filesystem root. The nearest config wins; parents are not merged. Multiple supported configs in one directory are an error. Use `--config path` to select a config explicitly. CLI flags override config values, then defaults apply. Boolean overrides include `--no-remove-unused-imports` and `--no-preserve-lambda-breaks`.

The Kotlin Syntax VS Code extension reads the same configuration. Project options override corresponding editor settings; executable configs require workspace trust. Config entry changes are picked up on the next format; restart the editor after changing imported helper modules.

## JavaScript API

```js
import { formatCode } from 'kotlin-format/wasm';

const result = formatCode('fun f(){println(42)}', 'KOTLINLANG', 100, false);
console.log(result);
// fun f() {
//     println(42)
// }
```

All four arguments are required: source, style, width and script mode (`true` for `.kts`). Importing this entry initializes WASM; formatting is synchronous afterward. Use `await import('kotlin-format/wasm')` for lazy loading.

For configuration-driven formatting:

```js
import { loadConfig, resolveOptions } from 'kotlin-format/config';
import { formatWithOptions } from 'kotlin-format/wasm';

const options = resolveOptions(await loadConfig('/path/to/Main.kt'));
const result = formatWithOptions(
  'val answer=42',
  options.maxWidth, options.blockIndent, options.continuationIndent,
  options.trailingCommas, options.removeUnusedImports,
  options.preserveLambdaBreaks, false,
);
console.log(result);
```

The Node-specific `kotlin-format/config` entry does not load WASM. There is no root package export.

## Formatting behavior

The current baseline is ktfmt 0.65 with the project's Kotlin 2.4.21 parser. Formatting operates on whole documents, preserves the source line-ending convention and rejects malformed syntax. Import removal is syntactic, not compiler-based; operator imports such as `getValue` and `setValue` are conservatively retained.

Each invocation performs one formatting pass. A small set of inputs changes again on a second pass in upstream ktfmt; this package preserves that behavior rather than repeatedly formatting until stable. See [formatting details and upstream alignment](https://github.com/lisonge/kotlin-syntax/blob/main/docs/formatting.md).

Apache-2.0. See [upstream attribution](https://github.com/lisonge/kotlin-syntax/blob/main/docs/upstream-sources.md). Report issues in the [project repository](https://github.com/lisonge/kotlin-syntax/issues).
