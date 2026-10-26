# Kotlin and Android integration

Kotlin Syntax exposes its parser and syntax classification API from the `kotlin-parser` KMP library. There is no compiler dependency in the runtime library; the official compiler is used only by JVM reference tests.

## Dependency

The current development coordinates are `li.songe:kotlin-parser:0.0.0-SNAPSHOT`. They are not available on Maven Central. Build and publish locally from the repository root:

```sh
./gradlew :kotlin-parser:publishKotlinMultiplatformPublicationToMavenLocal :kotlin-parser:publishJvmPublicationToMavenLocal
```

Add `mavenLocal()` to the consuming project's dependency repositories, then add the dependency to an Android application's `dependencies` or a KMP module's `commonMain.dependencies`:

```kotlin
implementation("li.songe:kotlin-parser:0.0.0-SNAPSHOT")
```

Android selects the JVM variant of this pure Kotlin library. The core configures only JVM and Wasm: it has no Android target, AGP or SDK dependency. JVM bytecode targets Java 8; the build uses JDK 21. Android compatibility is assumed from ordinary JVM support; there is no separate Android test suite. The core itself does not declare a minSdk. iOS/native targets are not currently configured or tested.

## Parsing and syntax classification

```kotlin
import li.songe.kotlin.lexer.tokenize
import li.songe.kotlin.parsing.parseFile
import li.songe.kotlin.parsing.parseScript
import li.songe.kotlin.tree.classifySyntax

val tokens = tokenize(source)           // List<Token>
val tree = parseFile(source)            // SyntaxNode
val scriptTree = parseScript(source)    // SyntaxNode for .kts
val spans = tree.classifySyntax()       // List<SyntaxClassification>
```

Each `SyntaxClassification` contains `start`, exclusive `end`, a `TokenType` and a `Set<TokenModifier>`. Ranges refer to the original string in UTF-16 code units, so they can be used directly with Android text spans and Compose text ranges. Spans are ordered, nonempty and nonoverlapping; whitespace and unclassified punctuation may be omitted.

The 19 token categories and five modifiers are defined in Kotlin. `DECLARATION`, `READONLY`, `ABSTRACT`, `ASYNC` and `DOCUMENTATION` describe syntax, not compiler semantic analysis. For example, `READONLY` marks a `val` declaration; it does not resolve the mutability of a reference elsewhere.

## Apply styles on Android

This example uses the standard Android text API, without adding an editor or theme dependency to the parser:

```kotlin
import android.graphics.Color
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import li.songe.kotlin.parsing.parseFile
import li.songe.kotlin.tree.TokenType
import li.songe.kotlin.tree.classifySyntax

val styled = SpannableString(source)
for (span in parseFile(source).classifySyntax()) {
    val color = when (span.type) {
        TokenType.KEYWORD -> Color.rgb(198, 120, 221)
        TokenType.STRING -> Color.rgb(152, 195, 121)
        TokenType.COMMENT -> Color.GRAY
        else -> Color.rgb(171, 178, 191)
    }
    styled.setSpan(
        ForegroundColorSpan(color), span.start, span.end,
        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
    )
}
textView.text = styled
```

For Compose, apply the same ranges through `AnnotatedString.Builder.addStyle`. Color selection and modifier styling belong to the consuming UI; the core library does not require Compose or One Dark Pro.

## Editing

```kotlin
import li.songe.kotlin.parsing.IncrementalDocument
import li.songe.kotlin.tree.classifySyntax

val document = IncrementalDocument("val answer = 42")
document.edit(start = 13, end = 15, text = "100")
val spans = document.tree.classifySyntax()
```

Use `script = true` for script documents. Edits address the current source, not the original snapshot. `IncrementalDocument` is mutable and not thread-safe: keep each document on one worker/dispatcher. Parsing is synchronous; run expensive work away from the UI thread and apply results only to the matching document version. Native Kotlin documents use ordinary object lifetimes; the numeric handles and `closeDocument` are only part of the WASM interface.

Incremental parsing reuses top-level prefixes. Scripts, preamble edits and damaged previous trees can trigger a full reparse. See [compatibility](compatibility.md) for limits.

## Same-file definitions

```kotlin
val document = IncrementalDocument("fun greet(name: String) = name")
val targets = document.definitionsAt(document.source.lastIndexOf("name"))
// List<DefinitionTarget>: start/end enclose the declaration;
// nameStart/nameEnd select its name. All ranges use UTF-16 and exclusive ends.
```

The lexical index is built on the first query and invalidated by edits. It resolves supported same-file declarations and explicit import aliases without loading dependencies. Overloads return multiple candidates; unsupported or ambiguous bindings return an empty list. It does not infer receiver types or perform cross-file lookup. See [compatibility](compatibility.md) for the navigation boundary.

The WASM navigation helpers `documentSymbols(id)` and `documentNavigationQuery(id, offset)` return JSON for the VS Code workspace resolver. Symbols contain package/import paths, declaration ownership, companion aliases, visibility and syntactic type hints. Queries contain a receiver path or local binding, its supported receiver mode, and selected member segments; unsupported queries return JSON `null`. These helpers do not read other files or alter parsing. Workspace lookup and candidate selection run in the extension.

## Verification

```sh
./gradlew :kotlin-parser:jvmTest
```

The JVM suite validates the Kotlin library. Android uses the same JVM artifact and is assumed compatible on that basis.
