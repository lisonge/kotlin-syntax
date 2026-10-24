# Kotlin Syntax

Syntax highlighting for Kotlin `.kt` and `.kts` files, powered by a Kotlin/WASM parser running in a Worker. Colors follow the active VS Code theme. No JVM language server or Gradle project import is needed for highlighting.

<img width="1344" height="743" alt="Image" src="https://github.com/user-attachments/assets/81700a18-8414-417d-a8a1-fb0aa83df866" />

*Actual screenshot of the project's web playground using One Dark Pro. The playground and extension share the Kotlin parser and token classifications; VS Code colors depend on your selected theme.*

## Features

- Highlights Kotlin source files (`.kt`) and scripts (`.kts`).
- Classifies declarations, types, functions, properties, strings, comments and other syntax.
- Updates highlighting as you type, including incomplete and malformed code.
- Runs parsing in a background Worker using WebAssembly, without a JVM language server or Gradle project import.
- Includes a dedicated log channel and a command to restart the parser.

## Installation

Requires **VS Code 1.117.0 or newer**. Installation and highlighting have been tested on 1.117.0.

### From Marketplace

Search for `@id:lisonge.kotlin-vscode` in Extensions, or open the [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=lisonge.kotlin-vscode), then select **Install**. This option is available once the extension has been published to Marketplace.

### From a VSIX

Download `kotlin-syntax-<version>.vsix` from [GitHub Releases](https://github.com/lisonge/kotlin-syntax/releases). Run **Extensions: Install from VSIX** in the Command Palette and select the downloaded file.

## Getting started

1. Open a `.kt` or `.kts` file and confirm the editor language mode is **Kotlin**.
2. Keep semantic highlighting enabled. This extension enables it by default for Kotlin; an explicit user or workspace override may disable it.
3. Choose your preferred color theme. For colors similar to the playground preview, use One Dark Pro.

If highlighting conflicts with another Kotlin extension, temporarily disable the other highlighting provider in the workspace to compare results.

## Scope and limitations

Supports incomplete and malformed code with parser error recovery. Symbol resolution, type checking and cross-file semantic analysis are not implemented. Parsing failures or a disabled semantic-highlighting setting can prevent coloring; this extension does not include a TextMate fallback.

## Troubleshooting

Run **Kotlin Syntax: Show Logs** to open the dedicated log channel, or select **Kotlin Syntax** in Output after activation. Use **Developer: Set Log Level...** to enable Debug for this channel when request timing is needed. Debug metadata includes request IDs, versions, lengths and script mode; source snapshots and document paths are not deliberately logged. Exception stacks are retained for diagnosis.

Requests time out after 30 seconds. A failed Worker is terminated and later requests can start a fresh one. After three consecutive failures, parsing pauses and a single warning offers logs or restart. Run **Kotlin Syntax: Restart Parser** to clear caches and resume; this also refreshes highlighting. Successful responses reset the failure count. Invalid Kotlin syntax is normal input and does not trigger this mechanism.

## License

Licensed under [Apache-2.0](LICENSE).

## Feedback

Report problems through [GitHub Issues](https://github.com/lisonge/kotlin-syntax/issues). Include your extension version, VS Code version, active theme and a small Kotlin example that reproduces the issue. See the [changelog](CHANGELOG.md) for release notes and the [source repository](https://github.com/lisonge/kotlin-syntax) for the parser and playground.
