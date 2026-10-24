@file:OptIn(kotlin.js.ExperimentalJsExport::class)
package li.songe.kotlin

import li.songe.kotlin.tree.toJson
import li.songe.kotlin.tree.highlightJson

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
fun closeDocument(id: Int) { documents.remove(id) }

/** Hot path: mutate without serializing the entire tree. */
@JsExport
fun applyDocumentEdit(id: Int, start: Int, end: Int, text: String) {
    documents.getValue(id).edit(start, end, text)
}
@JsExport
fun documentHighlights(id: Int): String = documents.getValue(id).tree.highlightJson()
