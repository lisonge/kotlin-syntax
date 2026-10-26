# Compatibility and scope

The current upstream syntax target is Kotlin 2.4.21. The exact source commit and checksums are recorded in [metadata.json](../kotlin-parser/upstream/metadata.json); the official compiler used by JVM tests is pinned in [libs.versions.toml](../gradle/libs.versions.toml). These pins describe the tested reference, not a claim to support every input or future Kotlin version.

## Implemented syntax

The lexer ports the Kotlin 2.4.21 JFlex DFA and actions to common Kotlin. The non-lazy file and script parser handles declarations, types, annotations, expressions and control flow in common Kotlin. JVM tests compare tokens and complete syntax trees (including UTF-16 ranges, trivia, and errors) with the unmodified official compiler. The same verified fixtures are replayed against the packaged WASM module. The VS Code extension loads the packaged WASM parser in a Node Worker and provides syntax-based semantic tokens, including incremental token updates and document lifecycle handling. The extension also performs limited same-package and explicit-import workspace lookup using parsed top-level declaration summaries; it does not perform compiler semantic resolution.

Supported declarations include classes/interfaces/objects, companion blocks, enum entries, primary/secondary constructors, functions, properties/accessors/backing fields, type aliases, modifiers, generic parameters/arguments, supertype lists, contracts and `where` constraints. Local declarations and destructuring are supported. Types include qualified, nullable, parenthesized, intersection, extension receiver, `suspend` and `context` function types, plus context parameters and receivers.

Annotations include file annotations, use-site targets, annotation lists and type annotations. Their arguments use the expression parser, including named/spread arguments, nested calls, class literals and collection literals. Expressions include operators and casts, calls and callable references, safe navigation, array access, strings/templates, lambdas, anonymous functions/objects, labels/jumps, `if`, `when` with guards, loops and `try`/`catch`/`finally`.

## Validation boundary

The differential corpus includes complete syntax trees from valid and malformed examples, every character prefix of expression/control-flow cases, script inputs, and the project's handwritten common Kotlin sources. Tests compare node kinds, UTF-16 ranges, trivia and error messages recursively. Passing this corpus does not prove equivalence for every Kotlin input. Compiler semantic analysis is not implemented.

The parser handles file and script syntax without compiler symbol resolution, type checking, overload resolution, IR generation or code generation. A separate lexical definition index supports same-file navigation and explicit import/alias destinations. It covers parameters, locals, captures, explicit lambda parameters, control-flow bindings, type parameters, top-level declarations and directly declared members referenced without a receiver. Same-scope overloads return candidate locations; no overload is selected. The VS Code workspace layer additionally handles qualified object members, nested types, companion members, enum entries, package star imports and instance members with explicit or simple constructor types. Callable references and named arguments of resolved functions/primary constructors also expose candidate destinations. Implicit bindings and file/import name conflicts remain unresolved; inherited members, generic inference and call-result chains are not resolved. Unknown receivers can prevent outer member/file lookup. Navigation offers known same-file top-level and enclosing member candidates for calls, properties and callable references across unknown receiver scopes, while preserving local shadowing and file/import conflicts. If a qualified lambda call has a syntactically known local receiver type, matching members of that type are also offered rather than choosing the enclosing member alone. Local classes/functions retain declaration identity, named arguments preserve overload candidates, and class/instance callable references and type-alias constructor parameters are supported. Private member access is restricted to the owning declaration; inherited protected access remains outside the supported scope. Highlighting retains the stricter binding rules. See the [extension limitations](../kotlin-vscode/README.md#scope-and-limitations).

For unresolved ordinary-variable references only, an unresolved PascalCase receiver segment in a plain dotted path such as `Settings.Secure.VALUE` receives class coloring after single-file analysis. The final segment is not changed by this rule, and the fallback does not cross calls or safe-access expressions. Names consisting entirely of uppercase letters, digits and underscores are excluded. This naming fallback does not affect navigation or type inference.

The extension uses the semantic token API for syntax-derived highlighting enhanced with same-file lexical bindings; this is not compiler semantic analysis. Language-feature acceptance and compiler diagnostics beyond parsing are outside this compatibility claim. Definition tests have independently written expected targets; parser differential tests do not establish compiler-equivalent name resolution.

## Library targets

The KMP library configures JVM (Java 8 bytecode, built with JDK 21) and Wasm. Android consumes the JVM JAR; the core has no Android target. Android compatibility is assumed from ordinary JVM support; there is no separate Android test suite. Native/iOS targets are not covered.

## Known limitations

- Incremental parsing reuses a top-level prefix, not arbitrary subtrees or lexer state. Scripts and damaged previous trees fall back to full parsing.
- A large enclosing declaration can still cause substantial reparsing.
- Worker cancellation suppresses obsolete results but cannot interrupt an active synchronous WASM parse.
- Syntax alone cannot reliably classify unresolved references as classes, functions or properties.
- Passing the current valid/malformed corpus does not establish universal equivalence with the compiler.

Node/pnpm requirements come from the root [package.json](../package.json), and the editor requirement comes from [kotlin-vscode/package.json](../kotlin-vscode/package.json). The minimum version is [VS Code 1.117.0](https://code.visualstudio.com/updates/v1_117), released on 2026-04-22 and selected on 2026-10-25 as the six-month compatibility baseline. Packaged VSIX installation and extension-host tests passed on VS Code 1.117.0; development-host tests also passed on 1.141.0. Upgrade procedure: [upstream-upgrade.md](upstream-upgrade.md).
