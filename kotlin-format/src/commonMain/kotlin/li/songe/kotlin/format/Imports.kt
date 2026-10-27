/* Copyright (c) Meta Platforms, Inc. and affiliates. Licensed under Apache-2.0.
 * Adapted from ktfmt 0.65 Formatter.sortedAndDistinctImports and RedundantImportDetector. */
package li.songe.kotlin.format
import li.songe.kotlin.format.psi.*

private fun names(e: PsiElement?): List<String> = when(e) {
    null -> emptyList()
    is KtSimpleNameExpression -> listOf(e.text.removeSurrounding("`"))
    else -> e.allChildren.flatMap(::names)
}
internal fun sortImports(source: String, script: Boolean): String {
    val list = parse(source, script).importList ?: return source
    if (list.imports.isEmpty()) return source
    fun canonical(i: KtImportDirective) = names(i.importedReference).joinToString(".") + " " + i.alias?.text?.replace("`", "") + " " + if(i.isAllUnder) "*" else ""
    val comments = list.allChildren.filterIsInstance<PsiComment>()
    val imports = list.imports.sortedBy(::canonical).distinctBy(::canonical)
    val body = (comments + imports).joinToString("\n") { it.text }
    val lastLine = body.lastIndexOf('\n')
    return source.replaceRange(list.startOffset, list.endOffset, body + if(lastLine >= 0 && body.indexOf("//", lastLine + 1) >= 0) "\n" else "")
}
private val operators = setOf("unaryPlus", "unaryMinus", "not", "inc", "dec", "plus", "minus", "times", "div", "rem", "mod", "rangeTo", "contains", "get", "set", "invoke", "plusAssign", "minusAssign", "timesAssign", "divAssign", "remAssign", "modAssign", "equals", "compareTo", "iterator", "next", "hasNext", "and", "or", "getValue", "setValue", "provideDelegate", "assign")
internal fun unusedImports(file: KtFile): List<PsiElement> {
    val used = operators.toMutableSet()
    val packageName = names(file.child<KtPackageDirective>())
    fun visit(e: PsiElement) {
        if (e is KtImportList || e is KtPackageDirective) return
        if (e is KtReferenceExpression && e.children.isEmpty()) used.add(e.text.trim('`'))
        if (e is PsiComment && e.text.startsWith("/**")) {
            used.addAll(kdocReferences(e.text))
        }
        e.allChildren.forEach(::visit)
    }
    visit(file)
    fun identifier(i: KtImportDirective) = (i.alias?.nameIdentifier?.text?.trim('`') ?: names(i.importedReference).lastOrNull())?.substringAfterLast('.')
    val candidates = file.importList?.imports.orEmpty().filter { !it.isAllUnder && identifier(it) != null && identifier(it) !in operators && !Regex("component\\d+").matches(identifier(it)!!) }
    val counts = candidates.groupingBy(::identifier).eachCount()
    return candidates.filter { i ->
        val path = names(i.importedReference)
        val samePackage = path.lastOrNull()?.contains('.') != true && path.dropLast(1) == packageName
        identifier(i) !in used || (samePackage && i.alias == null && counts[identifier(i)] == 1)
    }
}

/** KDoc references exclude Markdown labels, code spans and fenced/indented code blocks. */
internal fun kdocReferences(comment: String): Set<String> = buildSet {
    var fence: String? = null
    for (raw in comment.removePrefix("/**").removeSuffix("*/").lines()) {
        val line = raw.trimStart().let { if (it.startsWith('*')) it.drop(1).removePrefix(" ") else raw }
        val trimmed = line.trimStart()
        val marker = Regex("^(`{3,}|~{3,})").find(trimmed)?.value
        if (fence != null) {
            if (marker != null && marker[0] == fence[0] && marker.length >= fence.length) fence = null
            continue
        }
        if (marker != null) { fence = marker; continue }
        if (line.startsWith("    ") || line.startsWith('\t')) continue
        val skip = Regex("^@(param|property) +(?:\\[[^]]+]|[^ ]+)").find(trimmed)
        val text = if (skip != null) trimmed.substring(skip.range.last + 1) else trimmed
        Regex("^@(throws|exception|see|sample) +([^\\s]+)").find(text)?.let {
            add(it.groupValues[2].trim('[', ']').substringBefore('.').trim('`'))
        }
        var i = 0
        while (i < text.length) {
            when (text[i]) {
                '\\' -> i += 2
                '`' -> {
                    val start = i
                    while (i < text.length && text[i] == '`') i++
                    val end = text.indexOf(text.substring(start, i), i)
                    if (end >= 0) i = end + i - start
                }
                '[' -> {
                    val end = text.indexOf(']', i + 1)
                    if (end < 0) { i++; continue }
                    val target = text.substring(i + 1, end)
                    if (text.getOrNull(end + 1) !in listOf('[', '(') && target.none { it.isWhitespace() }) {
                        add(target.substringBefore('.').trim('`', '[', ']'))
                    }
                    i = end + 1
                }
                else -> i++
            }
        }
    }
}
