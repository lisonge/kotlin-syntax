# Kotlin Syntax

[English](README.md) | [简体中文](README-zh.md)

Kotlin Syntax is a Kotlin Multiplatform library for parsing and classifying Kotlin syntax, with a VS Code extension and an online playground powered by the same parser.

## Features

- Parse Kotlin files (`.kt`) and scripts (`.kts`) into lossless syntax trees that preserve whitespace, comments and syntax errors.
- Produce typed syntax classifications and update documents with incremental parsing.
- Use the library on JVM and Wasm, or integrate the JVM library into Android applications.
- Highlight Kotlin in VS Code through a background Worker, or explore it in the React playground with the One Dark Pro theme.

Tests compare parsing against the official Kotlin compiler. Highlighting is based on syntax; symbol resolution and type checking are outside the project's scope. See [compatibility and limitations](docs/compatibility.md) for the tested syntax and platform coverage.

## Modules

| Module | Purpose |
| --- | --- |
| [kotlin-parser](kotlin-parser/) | Portable parser, syntax trees, incremental documents and syntax classifications |
| [kotlin-vscode](kotlin-vscode/) | VS Code extension using the parser in a Worker |
| [kotlin-website](kotlin-website/) | Interactive playground using the same parser |

## Documentation

- [Kotlin and Android integration](docs/kotlin-api.md)
- [Local development and builds](docs/development.md)
- [Architecture](docs/architecture.md)
- [Compatibility and limitations](docs/compatibility.md)
- [Testing and releases](docs/testing.md)
- [Upstream upgrades](docs/upstream-upgrade.md)
- [Benchmarks](benchmarks/README.md)

## License

[Apache-2.0](LICENSE).
