@file:OptIn(kotlin.js.ExperimentalJsExport::class, kotlin.js.ExperimentalWasmJsInterop::class)
package li.songe.kotlin

import li.songe.kotlin.tree.toJson
import li.songe.kotlin.tree.jsonString
import li.songe.kotlin.tree.classificationData
import li.songe.kotlin.tree.TokenType
import li.songe.kotlin.tree.TokenModifier
import li.songe.kotlin.tree.fileSymbolsJson

private external class Int32Array(length: Int) : JsAny

private fun writeSpan(data: Int32Array, offset: Int, start: Int, end: Int, type: Int, modifiers: Int): Unit =
    js("{ data[offset] = start; data[offset + 1] = end; data[offset + 2] = type; data[offset + 3] = modifiers; }")

/** JSON boundary keeps compiler runtime objects out of the JS public interface. */
@JsExport
fun tokenize(source: String): String = li.songe.kotlin.lexer.tokenize(source).joinToString(
    prefix = "[", postfix = "]"
) { "{\"kind\":\"${it.kind}\",\"start\":${it.start},\"end\":${it.end}}" }

@JsExport
fun parseFile(source: String): String = li.songe.kotlin.parsing.parseFile(source).toJson()

@JsExport
fun parseScript(source: String): String = li.songe.kotlin.parsing.parseScript(source).toJson()

private val documents = mutableMapOf<Int, li.songe.kotlin.parsing.IncrementalDocument>()
private var nextDocument = 1
@JsExport
fun openDocument(source: String, script: Boolean): Int {
    val id = nextDocument++
    documents[id] = li.songe.kotlin.parsing.IncrementalDocument(source, script)
    return id
}
@JsExport
fun editDocument(id: Int, start: Int, end: Int, text: String): String =
    documents.getValue(id).edit(start, end, text).toJson()
@JsExport
fun documentTree(id: Int): String = documents.getValue(id).tree.toJson()
@JsExport
fun documentSymbols(id: Int): String = documents.getValue(id).let { it.tree.fileSymbolsJson(it.source) }
@JsExport
fun documentNavigationQuery(id: Int, offset: Int): String = documents.getValue(id).navigationQueryAt(offset)
@JsExport
fun documentExternalReference(id: Int, offset: Int): String = documents.getValue(id).externalReferenceAt(offset)?.let {
    """{"name":${jsonString(it.name)},"type":${it.type},"constructorOnly":${it.constructorOnly},"importOnly":${it.importOnly}}"""
} ?: "null"
@JsExport
fun closeDocument(id: Int) { documents.remove(id) }

/** Hot path: mutate without serializing the entire tree. */
@JsExport
fun applyDocumentEdit(id: Int, start: Int, end: Int, text: String) {
    documents.getValue(id).edit(start, end, text)
}
@JsExport
fun documentClassifications(id: Int): JsAny {
    val spans = documents.getValue(id).classificationData()
    val data = Int32Array(spans.size)
    for (i in spans.indices step 4) {
        writeSpan(data, i, spans[i], spans[i + 1], spans[i + 2], spans[i + 3])
    }
    return data
}

@JsExport
fun tokenLegend(): String {
    val types = TokenType.entries.joinToString(prefix = "[", postfix = "]") { jsonString(it.wireName) }
    val modifiers = TokenModifier.entries.joinToString(prefix = "[", postfix = "]") { jsonString(it.wireName) }
    return """{"types":$types,"modifiers":$modifiers}"""
}

/** Repeating [declarationStart, declarationEnd, nameStart, nameEnd] in UTF-16 offsets. */
@JsExport
fun documentDefinitions(id: Int, offset: Int): JsAny {
    val targets = documents.getValue(id).definitionsAt(offset)
    val data = Int32Array(targets.size * 4)
    targets.forEachIndexed { index, target ->
        writeSpan(data, index * 4, target.start, target.end, target.nameStart, target.nameEnd)
    }
    return data
}
