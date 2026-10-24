package li.songe.kotlin.builder

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SemanticBuilderTest {
    @Test fun joinsOnlyAdjacentOperatorsAndBuildsCollapsedLeaves() {
        val builder = SemanticBuilder(SyntaxBuilder("a?.b ?: c!! ? ."))
        val root = builder.delegate.mark()
        val kinds = mutableListOf<String>()
        while (!builder.delegate.eof()) {
            kinds += checkNotNull(builder.tokenType)
            builder.advanceLexer()
        }
        root.done("ROOT")
        assertEquals(listOf("IDENTIFIER", "SAFE_ACCESS", "IDENTIFIER", "ELVIS", "IDENTIFIER", "EXCLEXCL", "QUEST", "DOT"), kinds)
        val tree = builder.delegate.buildTree()
        assertEquals(kinds, tree.children.filterNot { isTrivia(it.kind) }.map { it.kind })
        assertEquals(listOf("?.", "?:", "!!"), tree.children.filter { it.kind in setOf("SAFE_ACCESS", "ELVIS", "EXCLEXCL") }
            .map { builder.delegate.source.substring(it.start, it.end) })
    }

    @Test fun newlineStateIsNestedAndIgnoresNewlinesInsideComments() {
        val builder = SemanticBuilder(SyntaxBuilder("a/*\n*/b\n/*c*/d"))
        assertFalse(builder.newlineBeforeCurrentToken())
        builder.advanceLexer()
        assertFalse(builder.newlineBeforeCurrentToken())
        builder.advanceLexer()
        assertTrue(builder.newlineBeforeCurrentToken())
        builder.disableNewlines()
        assertFalse(builder.newlineBeforeCurrentToken())
        builder.enableNewlines()
        assertTrue(builder.newlineBeforeCurrentToken())
        builder.restoreNewlinesState()
        assertFalse(builder.newlineBeforeCurrentToken())
        builder.restoreNewlinesState()
        assertTrue(builder.newlineBeforeCurrentToken())
        builder.advanceLexer()
        assertTrue(builder.newlineBeforeCurrentToken())
    }
}
