package li.songe.kotlin.parsing

import li.songe.kotlin.tree.SyntaxNode

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
    private fun parse(text: String) = if (script) parseScript(text) else parseFile(text)
    private fun damaged(node: SyntaxNode): Boolean = node.error != null || node.children.any(::damaged)
    private fun shift(node: SyntaxNode, delta: Int): SyntaxNode = node.copy(
        start = node.start + delta, end = node.end + delta, children = node.children.map { shift(it, delta) })
    fun edit(start: Int, end: Int, text: String): SyntaxNode {
        require(start in 0..source.length && end in start..source.length)
        val updated = source.replaceRange(start, end, text)
        val declarations = tree.children.withIndex().filter { it.value.kind in setOf(
            "CLASS", "OBJECT_DECLARATION", "FUN", "PROPERTY", "TYPEALIAS") }
        val before = declarations.filter { it.value.end < start }
        val restart = before.lastOrNull()
        reparsedFrom = 0
        tree = if (!script && !damaged(tree) && restart != null && before.size >= 2) {
            val offset = restart.value.start
            val suffix = parseFile(updated.substring(offset))
            val headers = suffix.children.take(2)
            if (headers.map { it.kind } == listOf("PACKAGE_DIRECTIVE", "IMPORT_LIST") && headers.all { it.end == 0 }) {
                reparsedFrom = offset
                tree.copy(end = updated.length, children = tree.children.take(restart.index) + suffix.children.drop(2).map { shift(it, offset) })
            } else parse(updated)
        } else parse(updated)
        source = updated
        return tree
    }
}
