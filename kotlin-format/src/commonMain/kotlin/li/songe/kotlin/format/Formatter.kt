package li.songe.kotlin.format

import li.songe.kotlin.format.engine.OpsBuilder
import li.songe.kotlin.format.psi.KtFile
import li.songe.kotlin.format.psi.wrap
import li.songe.kotlin.format.upstream.ParseError
import li.songe.kotlin.format.upstream.WhitespaceTombstones
import li.songe.kotlin.format.upstream.TrailingCommas
import li.songe.kotlin.format.upstream.RedundantSemicolonDetector
import li.songe.kotlin.format.upstream.MultilineStringFormatter
import li.songe.kotlin.format.psi.PsiElement
import li.songe.kotlin.format.psi.KtElement
import li.songe.kotlin.format.upstream.visitor.AbstractKotlinFormatter
import li.songe.kotlin.format.upstream.visitor.kotlinlang.*
import li.songe.kotlin.parsing.parseFile
import li.songe.kotlin.parsing.parseScript
import li.songe.kotlin.tree.SyntaxNode

typealias FormattingOptions = li.songe.kotlin.format.upstream.FormattingOptions
typealias TrailingCommaManagementStrategy = li.songe.kotlin.format.upstream.TrailingCommaManagementStrategy

enum class FormatStyle { META, GOOGLE, KOTLINLANG }

fun formattingOptions(style: FormatStyle = FormatStyle.KOTLINLANG): FormattingOptions = when (style) {
    FormatStyle.META -> FormattingOptions(blockIndent = 2, continuationIndent = 4, trailingCommaManagementStrategy = TrailingCommaManagementStrategy.ONLY_ADD)
    FormatStyle.GOOGLE -> FormattingOptions(blockIndent = 2, continuationIndent = 2)
    FormatStyle.KOTLINLANG -> FormattingOptions(blockIndent = 4, continuationIndent = 4)
}

fun format(source: String, options: FormattingOptions = formattingOptions(), script: Boolean = false): String {
    require(options.maxWidth in 1..999) { "Line width must be between 1 and 999" }
    val forbidden = source.indexOfFirst { it in '\u0003'..'\u0005' }
    if (forbidden >= 0) throw ParseError("Unsupported formatting escape character", forbidden)
    val separator = Regex("\r\n|\r|\n").find(source)?.value ?: "\n"
    val normalized = source.replace("\r\n", "\n").replace('\r', '\n')
    if (normalized.isBlank()) return if (source.isEmpty()) "\n" else source
    var current = cleanup(sortImports(normalized, script), options, script)
    current = addCommas(current, options, script)
    while (true) {
        val pretty = prettyPrint(current, options, script)
        val withCommas = addCommas(pretty, options, script)
        if (pretty == withCommas) {
            return MultilineStringFormatter(options.continuationIndent).format(parse(pretty, script)).replace("\n", separator)
        }
        current = withCommas
    }
}

private fun prettyPrint(source: String, options: FormattingOptions, script: Boolean): String {
    val file = parse(source, script)
    val builder = OpsBuilder(file)
    val visitor = if (options.useExperimentalEngine) object : AbstractKotlinFormatter(options, builder,
        annotationFormatter = KotlinLangAnnotationFormatterImpl(), callFormatter = KotlinLangCallFormatterImpl(),
        declarationFormatter = KotlinLangDeclarationFormatterImpl(), expressionFormatter = KotlinLangExpressionFormatterImpl(),
        listFormatter = KotlinLangListFormatterImpl()) {} else object : AbstractKotlinFormatter(options, builder) {}
    file.accept(visitor)
    builder.sync(source.length)
    builder.drain()
    return WhitespaceTombstones.replaceTombstoneWithTrailingWhitespace(builder.render(options.maxWidth))
}

private fun walk(element: PsiElement, action: (PsiElement) -> Unit) { action(element); element.allChildren.forEach { walk(it, action) } }
private fun cleanup(source: String, options: FormattingOptions, script: Boolean): String {
    val file = parse(source, script)
    val semicolons = RedundantSemicolonDetector()
    val commas = TrailingCommas.Detector()
    walk(file) {
        semicolons.takeElement(it)
        if (options.trailingCommaManagementStrategy.removeRedundantTrailingCommas) commas.takeElement(it)
    }
    val result = StringBuilder(source)
    val imports = if (options.removeUnusedImports) unusedImports(file) else emptyList()
    for (element in (semicolons.getRedundantSemicolonElements() + commas.getTrailingCommaElements() + imports).sortedByDescending { it.endOffset }) {
        result.deleteRange(element.startOffset, element.endOffset).insert(element.startOffset, if (element.text == ";" && element.nextSibling?.text?.contains('\n') != true) "\n" else "")
    }
    return result.toString()
}
private fun addCommas(source: String, options: FormattingOptions, script: Boolean): String {
    if (!options.manageTrailingCommas) return source
    val suggestions = TrailingCommas.Suggestor()
    walk(parse(source, script)) { if (it is KtElement) suggestions.takeElement(it) }
    val result = StringBuilder(source)
    for (element in suggestions.getTrailingCommaSuggestions().sortedByDescending { it.endOffset }) result.insert(element.endOffset, ',')
    return result.toString()
}

internal fun parse(source: String, script: Boolean): KtFile {
    val tree = if (script) parseScript(source) else parseFile(source)
    fun check(node: SyntaxNode) {
        node.error?.let { throw ParseError(it, node.start) }
        node.children.forEach(::check)
    }
    check(tree)
    return wrap(tree, source, null) as KtFile
}
