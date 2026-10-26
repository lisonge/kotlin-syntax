# Kotlin Syntax

Kotlin syntax highlighting and definition navigation for VS Code. Supports `.kt` and `.kts` files, follows your editor theme, and works without a JVM language server or Gradle project import.

Powered by a portable adaptation of the official Kotlin parser, compiled to WebAssembly with Kotlin/Wasm. Try the same parser in the [online playground](https://kotlin-syntax.pages.dev).

<img referrerpolicy="no-referrer" alt="Kotlin highlighting in the web playground with One Dark Pro" src="https://github.com/user-attachments/assets/a0150858-991f-4b0e-a135-c72bd19e647a" />

## Features

- **Syntax highlighting** for classes, objects, functions, properties, parameters and other Kotlin syntax, enhanced by analysis of declarations and usage in the current file.
- **Live updates** while typing, including incomplete and malformed code. Parsing runs in a background Worker.
- **Go to Definition (F12)** for supported declarations, members, callable references and named parameters.
- **Cross-file navigation** to workspace Kotlin sources using package names, imports and aliases. Source lookup runs on demand; it does not parse the entire project at startup.

## Getting started

Requires **VS Code 1.117.0 or newer**. Install [Kotlin Syntax](https://marketplace.visualstudio.com/items?itemName=lisonge.kotlin-vscode) from the Marketplace, or search for `@id:lisonge.kotlin-vscode` in Extensions.

1. Open a `.kt` or `.kts` file with the language mode set to **Kotlin**.
2. Keep semantic highlighting enabled and choose your preferred color theme.
3. Press **F12** on an identifier to navigate. Open the project as a workspace to enable cross-file lookup.

## What to expect

Highlighting stays within the current file. Navigation can also search workspace `.kt` source files; ambiguous matches may appear as multiple candidates, and unresolved imports can lead to the import statement.

This extension provides highlighting and source navigation, not compiler-level type checking or complete type inference. Some references remain unresolved, including inherited members and members accessed through function-call results. It does not search JAR contents or resolve Gradle dependencies. Workspace lookup skips ignored files, dot-prefixed directories, and `node_modules`, `build` and `dist` directories.

If colors are missing, check `editor.semanticHighlighting.enabled` and whether another Kotlin extension is overriding them. For stale results, run **Kotlin Syntax: Restart Parser**. **Kotlin Syntax: Show Logs** opens the diagnostic output.

## Feedback

Report issues on [GitHub](https://github.com/lisonge/kotlin-syntax/issues) with your extension version, VS Code version and a small Kotlin example. The [source repository](https://github.com/lisonge/kotlin-syntax) contains development information, and the [changelog](CHANGELOG.md) lists release notes.

## License

[Apache-2.0](LICENSE).
