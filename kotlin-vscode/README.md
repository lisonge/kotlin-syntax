# Kotlin Syntax

Kotlin syntax highlighting and definition navigation for VS Code. Supports `.kt` and `.kts` files, follows your editor theme, and works without a JVM language server or Gradle project import.

Powered by a portable adaptation of the official Kotlin parser, compiled to WebAssembly with Kotlin/Wasm. Try the same parser in the [online playground](https://kotlin-syntax.pages.dev).

<img referrerpolicy="no-referrer" alt="Kotlin highlighting in the web playground with One Dark Pro" src="https://github.com/user-attachments/assets/a0150858-991f-4b0e-a135-c72bd19e647a" />

## Features

- **Syntax highlighting** for classes, objects, functions, properties, parameters and other Kotlin syntax, enhanced by analysis of declarations and usage in the current file.
- **Live updates** while typing, including incomplete and malformed code. Parsing runs in a background Worker.
- **Go to Definition (F12)** for supported declarations, members, callable references and named parameters.
- **Cross-file navigation** to workspace Kotlin sources using package names, imports and aliases. Source lookup runs on demand; it does not parse the entire project at startup.
- **Format Document** for `.kt` and `.kts`, compatible with ktfmt 0.65 and powered by WebAssembly. No local Java installation is needed.

## Getting started

Requires **VS Code 1.117.0 or newer**. Install [Kotlin Syntax](https://marketplace.visualstudio.com/items?itemName=lisonge.kotlin-vscode) from the Marketplace, or search for `@id:lisonge.kotlin-vscode` in Extensions.

1. Open a `.kt` or `.kts` file with the language mode set to **Kotlin**.
2. Keep semantic highlighting enabled and choose your preferred color theme.
3. Press **F12** on an identifier to navigate. Open the project as a workspace to enable cross-file lookup.

## What to expect

Use **Format Document With… → Kotlin Syntax** to select the formatter. To enable formatting on save:

```json
{
  "[kotlin]": {
    "editor.defaultFormatter": "lisonge.kotlin-vscode",
    "editor.formatOnSave": true
  },
  "kotlinSyntax.format.style": "KOTLINLANG",
  "kotlinSyntax.format.maxWidth": 100
}
```

Styles are `KOTLINLANG` (default), `GOOGLE`, and `META`. Each style controls indentation and trailing commas; editor tab settings do not override it. Formatting sorts imports, removes syntactically unused imports and formats comments. It operates on the whole document and rejects incomplete syntax. The Dev extension uses `lisonge.kotlin-vscode-dev` as its default-formatter ID.

The formatter also reads the nearest `kotlin-format.json`, `kotlin-format.config.js`, `kotlin-format.config.mjs` or `kotlin-format.config.ts`, searching from the source file up to the nearest package/Git root. Project options override corresponding VS Code settings. JSON uses `JSON.parse`; module configs are ESM-only and export an object through `export default`. CommonJS and `.cjs` are not supported. TS uses the host's native type stripping and supports erasable syntax. Module configs require a trusted workspace. JSONC is not supported. Edits to the config entry are picked up on the next format; restart the editor after editing imported helpers. The CLI uses the same reader. Supported properties are `style`, `maxWidth` (1–999), `removeUnusedImports` and `preserveLambdaBreaks`; the latter two default to `true`. Untitled documents use VS Code settings.

Highlighting stays within the current file. Navigation can also search workspace `.kt` source files; ambiguous matches may appear as multiple candidates, and unresolved imports can lead to the import statement.

This extension provides highlighting and source navigation, not compiler-level type checking or complete type inference. Some references remain unresolved, including inherited members and members accessed through function-call results. It does not search JAR contents or resolve Gradle dependencies. Workspace lookup skips ignored files, dot-prefixed directories, and `node_modules`, `build` and `dist` directories.

If colors are missing, check `editor.semanticHighlighting.enabled` and whether another Kotlin extension is overriding them. For stale results, run **Kotlin Syntax: Restart Parser**. **Kotlin Syntax: Show Logs** opens the diagnostic output.

## Feedback

Report issues on [GitHub](https://github.com/lisonge/kotlin-syntax/issues) with your extension version, VS Code version and a small Kotlin example. The [source repository](https://github.com/lisonge/kotlin-syntax) contains development information, and the [changelog](https://github.com/lisonge/kotlin-syntax/blob/main/CHANGELOG.md) lists release notes.

## License

[Apache-2.0](LICENSE).
