package li.songe.kotlin.builder

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import li.songe.kotlin.tree.SyntaxNode

class BuilderTest {
    @Test fun scenariosPreserveRanges() {
        for (case in BuilderScenarios.all) {
            val root = BuilderScenarios.runPortable(case)
            assertEquals(0, root.start, case.name)
            assertEquals(case.source.length, root.end, case.name)
            fun verify(node: SyntaxNode) {
                var end = node.start
                for (child in node.children) {
                    assertTrue(child.start >= end && child.end <= node.end, case.name + ": " + node)
                    verify(child); end = child.end
                }
            }
            verify(root)
        }
    }
    @Test fun markerOrderAndOwnershipAreChecked() {
        val b = SyntaxBuilder("a b")
        val root = b.mark(); val first = b.mark(); b.advanceLexer(); val second = b.mark()
        assertFailsWith<IllegalStateException> { second.doneBefore("X", first) }
        assertFailsWith<IllegalStateException> { first.doneBefore("X", first) }
        val foreign = SyntaxBuilder("").mark()
        assertFailsWith<IllegalArgumentException> { first.doneBefore("X", foreign) }
        second.drop(); first.drop()
        while (!b.eof()) b.advanceLexer()
        root.done("ROOT"); b.buildTree()
    }
    @Test fun invalidMarkerUseFailsExplicitly() {
        val builder = SyntaxBuilder("a")
        val root = builder.mark()
        val rollback = builder.mark()
        val inner = builder.mark()
        builder.advanceLexer(); inner.done("NODE"); rollback.rollbackTo()
        assertFailsWith<IllegalStateException> { inner.precede() }
        builder.advanceLexer(); root.done("ROOT"); builder.buildTree()
        assertFailsWith<IllegalStateException> { builder.mark() }
    }
}
