package li.songe.kotlin.parsing

import li.songe.kotlin.tree.SyntaxNode
import li.songe.kotlin.tree.DefinitionIndex
import li.songe.kotlin.tree.DefinitionTarget
import li.songe.kotlin.tree.navigationQueryJson
import li.songe.kotlin.tree.localClassificationData
import li.songe.kotlin.tree.LocalNavigation

/** UTF-16 edits. Reparse from the preceding top-level declaration to EOF.
 * Scripts, damaged trees and preamble edits deliberately use the full parser.
 */
class IncrementalDocument(initial: String, private val script: Boolean = false) {
    var source: String = initial
        private set
    var tree: SyntaxNode = parse(initial)
        private set
    var reparsedFrom: Int = 0
        private set
    private var definitions: DefinitionIndex? = null
    private var navigation: LocalNavigation? = null
    private var classifications: IntArray? = null
    internal fun classificationData(): IntArray = classifications ?: tree.localClassificationData(source,
        definitions ?: DefinitionIndex(tree, source).also { definitions = it }).also { classifications = it }
    fun definitionsAt(offset: Int): List<DefinitionTarget> =
        (navigation ?: LocalNavigation(tree, source,
            definitions ?: DefinitionIndex(tree, source).also { definitions = it }).also { navigation = it }).definitionsAt(offset)
    fun externalReferenceAt(offset: Int) =
        (definitions ?: DefinitionIndex(tree, source).also { definitions = it }).externalReferenceAt(offset)
    fun navigationQueryAt(offset: Int) = tree.navigationQueryJson(source, offset,
        definitions ?: DefinitionIndex(tree, source).also { definitions = it })
    // The official lexer expects editor-normalized line endings. Keep every UTF-16
    // position by replacing CR with LF rather than removing it from CRLF pairs.
    private fun parse(text: String): SyntaxNode {
        val normalized = text.replace('\r', '\n')
        return if (script) parseScript(normalized) else parseFile(normalized)
    }
    private fun damaged(node: SyntaxNode): Boolean = node.error != null || node.children.any(::damaged)
    private fun shift(node: SyntaxNode, delta: Int): SyntaxNode = node.copy(
        start = node.start + delta, end = node.end + delta, children = node.children.map { shift(it, delta) })
    fun edit(start: Int, end: Int, text: String): SyntaxNode {
        require(start in 0..source.length && end in start..source.length)
        val updated = source.replaceRange(start, end, text)
        val trailing = tree.children.lastOrNull()
        if (!script && trailing?.kind == "WHITE_SPACE" && start == source.length && end == start && !damaged(tree) &&
            text.all { it == ' ' || it == '\t' || it == '\r' || it == '\n' || it == '\u000C' }) {
            // Only root-level trailing trivia changes; declaration offsets and all classified spans remain valid.
            tree = tree.copy(end = updated.length, children = tree.children.dropLast(1) + trailing.copy(end = updated.length))
            source = updated
            reparsedFrom = trailing.start
            return tree
        }
        val declarations = tree.children.withIndex().filter { it.value.kind in setOf(
            "CLASS", "OBJECT_DECLARATION", "FUN", "PROPERTY", "TYPEALIAS") }
        val before = declarations.filter { it.value.end < start }
        val restart = before.lastOrNull()
        reparsedFrom = 0
        tree = if (!script && !damaged(tree) && restart != null && before.size >= 2) {
            val offset = restart.value.start
            val suffix = parse(updated.substring(offset))
            val headers = suffix.children.take(2)
            if (headers.map { it.kind } == listOf("PACKAGE_DIRECTIVE", "IMPORT_LIST") && headers.all { it.end == 0 }) {
                reparsedFrom = offset
                tree.copy(end = updated.length, children = tree.children.take(restart.index) + suffix.children.drop(2).map { shift(it, offset) })
            } else parse(updated)
        } else parse(updated)
        source = updated
        definitions = null
        navigation = null
        classifications = null
        return tree
    }
}
