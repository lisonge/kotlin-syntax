package li.songe.kotlin.parsing

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import li.songe.kotlin.tree.SyntaxNode

class ParserTest {
    @Test fun supportedTreesAreLossless() {
        for ((source, script) in ParserCases.sources.map { it to false } + ControlCases.scripts.map { it to true }) {
            val tree = if (script) parseScript(source) else parseFile(source)
            fun leaves(node: SyntaxNode): String {
                assertTrue(node.start <= node.end && node.end <= source.length)
                return if (node.children.isEmpty()) source.substring(node.start, node.end)
                else node.children.joinToString("") { leaves(it) }
            }
            assertEquals(source, leaves(tree), source)
        }
    }
}
