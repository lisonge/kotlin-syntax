@file:OptIn(kotlin.js.ExperimentalJsExport::class)
package li.songe.kotlin.format.wasm

import li.songe.kotlin.format.*

@JsExport
fun formatCode(source: String, style: String, maxWidth: Int, script: Boolean): String =
    format(source, formattingOptions(FormatStyle.valueOf(style)).copy(maxWidth = maxWidth), script)

@JsExport
fun formatWithOptions(source: String, maxWidth: Int, blockIndent: Int, continuationIndent: Int,
    trailingCommas: String, removeUnusedImports: Boolean, preserveLambdaBreaks: Boolean, script: Boolean): String =
    format(source, FormattingOptions(maxWidth = maxWidth, blockIndent = blockIndent, continuationIndent = continuationIndent,
        trailingCommaManagementStrategy = TrailingCommaManagementStrategy.valueOf(trailingCommas),
        removeUnusedImports = removeUnusedImports, preserveLambdaBreaks = preserveLambdaBreaks), script)
