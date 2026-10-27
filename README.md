# Kotlin Syntax

[English](README.md) | [简体中文](README-zh.md)

[Live Demo](https://kotlin-syntax.pages.dev) | [Install VS Code Extension](https://marketplace.visualstudio.com/items?itemName=lisonge.kotlin-vscode)

Kotlin Syntax is a Kotlin Multiplatform library for parsing and classifying Kotlin source, with a VS Code extension and an online playground powered by the same parser.

<img referrerpolicy="no-referrer" alt="Kotlin highlighting in the web playground with One Dark Pro" src="https://github.com/user-attachments/assets/a0150858-991f-4b0e-a135-c72bd19e647a" />

## Features

- **Parsing:** Parse `.kt` files and `.kts` scripts into lossless syntax trees that preserve whitespace, comments and syntax errors. The parser follows the official Kotlin parsing flow, with differential tests against the pinned compiler version. Incremental documents support updates after edits. The library targets JVM and Wasm; Android applications can use the JVM library.
- **Highlighting:** Combine syntax with single-file declarations, explicit types and supported usage-based inference. Highlighting stays within the current file and does not scan the workspace. Both editors use the same classifications; VS Code follows your selected theme, while the playground uses One Dark Pro.
- **Navigation:** Find declarations, supported members, callable references and named parameters in the current file. VS Code also searches workspace Kotlin sources on demand using package and import information. Ambiguous matches remain candidates; unresolved explicit imports can retain their import destination.

| Capability | VS Code extension | Web playground |
| --- | --- | --- |
| Highlighting and document updates | Yes, in a background Worker | Yes, in a background Worker |
| Same-file definition navigation | Yes | Yes |
| Workspace source navigation | Yes, on demand | No |
| ktfmt-compatible document formatting | Yes, in a separate Worker | No |

The project does not provide compiler-level type checking, complete type inference or Gradle dependency resolution. See [compatibility and limitations](docs/compatibility.md) for the tested syntax target and supported analysis. The [extension guide](kotlin-vscode/README.md) explains installation, highlighting rules and navigation behavior.

## Modules

| Module | Purpose |
| --- | --- |
| [kotlin-parser](kotlin-parser/) | Portable parser, syntax trees, incremental documents, classifications and single-file navigation |
| [kotlin-format](kotlin-format/) | Portable ktfmt 0.65 formatting with the google-java-format 1.23.0 layout engine |
| [kotlin-vscode](kotlin-vscode/) | VS Code highlighting and definition navigation using the parser in a Worker |
| [kotlin-website](kotlin-website/) | Interactive playground using the same parser |

## Documentation

- [Kotlin and Android integration](docs/kotlin-api.md)
- [Formatting API and upstream alignment](docs/formatting.md)
- [Local development and builds](docs/development.md)
- [Architecture](docs/architecture.md)
- [Compatibility and limitations](docs/compatibility.md)
- [Testing and releases](docs/testing.md)
- [Upstream upgrades](docs/upstream-upgrade.md)
- [Upstream source synchronization and attribution](docs/upstream-sources.md)
- [Benchmarks](benchmarks/README.md)

## License

[Apache-2.0](LICENSE).
