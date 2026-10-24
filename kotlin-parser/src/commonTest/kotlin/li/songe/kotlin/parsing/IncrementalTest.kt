package li.songe.kotlin.parsing
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
class IncrementalTest {
    @Test fun editsMatchFreshParse() {
        val prefix = "package sample\nclass A {}\nfun first() = 1\n"
        for (body in ExpressionCases.sources + ControlCases.files) {
            val original = prefix + body
            for (position in original.indices step 3) {
                for (text in listOf("", "x", "\n/*", "}", "\uD83D\uDE00")) {
                    val document = IncrementalDocument(original)
                    document.edit(position, minOf(position + 1, original.length), text)
                    assertEquals(parseFile(document.source), document.tree, "$position $text $original")
                }
            }
        }
    }
    @Test fun reusesPrefixAndHandlesSequentialEdits() {
        val d = IncrementalDocument("class A {}\nclass B {}\nclass C {}\nval x = 1")
        val first = d.tree.children.first { it.kind == "CLASS" }
        d.edit(d.source.length - 1, d.source.length, "42")
        assertTrue(d.reparsedFrom > 0)
        assertTrue(first === d.tree.children.first { it.kind == "CLASS" })
        for (text in listOf("/*", "*/", "\nval y = String::class", "\n")) {
            d.edit(d.source.length, d.source.length, text)
            assertEquals(parseFile(d.source), d.tree)
        }
        val script = IncrementalDocument("println(1)", true)
        script.edit(8, 9, "2")
        assertEquals(parseScript(script.source), script.tree)
    }
}
