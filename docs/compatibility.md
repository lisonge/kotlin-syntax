# Compatibility and scope

The current upstream syntax target is Kotlin 2.4.21. The exact source commit and checksums are recorded in [metadata.json](../kotlin-parser/upstream/metadata.json); the official compiler used by JVM tests is pinned in [libs.versions.toml](../gradle/libs.versions.toml). These pins describe the tested reference, not a claim to support every input or future Kotlin version.

## Implemented syntax

The lexer ports the Kotlin 2.4.21 JFlex DFA and actions to common Kotlin. The non-lazy file and script parser handles declarations, types, annotations, expressions and control flow in common Kotlin. JVM tests compare tokens and complete syntax trees (including UTF-16 ranges, trivia, and errors) with the unmodified official compiler. The same verified fixtures are replayed against the packaged WASM module. The VS Code extension loads the packaged WASM parser in a Node Worker and provides syntax-based semantic tokens, including incremental token updates and document lifecycle handling. It does not resolve symbols across files.

Supported declarations include classes/interfaces/objects, companion blocks, enum entries, primary/secondary constructors, functions, properties/accessors/backing fields, type aliases, modifiers, generic parameters/arguments, supertype lists, contracts and `where` constraints. Local declarations and destructuring are supported. Types include qualified, nullable, parenthesized, intersection, extension receiver, `suspend` and `context` function types, plus context parameters and receivers.

Annotations include file annotations, use-site targets, annotation lists and type annotations. Their arguments use the expression parser, including named/spread arguments, nested calls, class literals and collection literals. Expressions include operators and casts, calls and callable references, safe navigation, array access, strings/templates, lambdas, anonymous functions/objects, labels/jumps, `if`, `when` with guards, loops and `try`/`catch`/`finally`.

## Validation boundary

The differential corpus includes complete syntax trees from valid and malformed examples, every character prefix of expression/control-flow cases, script inputs, and the project's handwritten common Kotlin sources. Tests compare node kinds, UTF-16 ranges, trivia and error messages recursively. Passing this corpus does not prove equivalence for every Kotlin input. Compiler semantic analysis is not implemented.

The parser handles file and script syntax without symbol resolution, type checking, overload resolution, IR generation or code generation. The extension uses the semantic token API for syntax-derived highlighting; this is not compiler semantic analysis. Language-feature acceptance and compiler diagnostics beyond parsing are outside this compatibility claim.

## Known limitations

- Incremental parsing reuses a top-level prefix, not arbitrary subtrees or lexer state. Scripts and damaged previous trees fall back to full parsing.
- A large enclosing declaration can still cause substantial reparsing.
- Worker cancellation suppresses obsolete results but cannot interrupt an active synchronous WASM parse.
- Syntax alone cannot reliably classify unresolved references as classes, functions or properties.
- Passing the current valid/malformed corpus does not establish universal equivalence with the compiler.

Node/pnpm requirements come from the root [package.json](../package.json), and the editor requirement comes from [kotlin-vscode/package.json](../kotlin-vscode/package.json). The extension host has been validated on VS Code 1.141.0. Upgrade procedure: [upstream-upgrade.md](upstream-upgrade.md).
