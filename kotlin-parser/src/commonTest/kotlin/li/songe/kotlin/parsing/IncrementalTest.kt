package li.songe.kotlin.parsing
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
class IncrementalTest {
    @Test fun trailingWhitespacePreservesAnalysisAndMatchesFreshParsing() {
        val source = "class Box(val value: Int)\nfun f(x: Int) = x\n"
        val document = IncrementalDocument(source)
        val data = document.classificationData()
        val target = document.definitionsAt(source.lastIndexOf('x'))
        for (text in listOf(" ", "\t", "\r\n", "\u000C")) {
            document.edit(document.source.length, document.source.length, text)
            assertEquals(parseFile(document.source.replace('\r', '\n')), document.tree)
            assertTrue(data === document.classificationData())
            assertEquals(target, document.definitionsAt(source.lastIndexOf('x')))
        }
        document.edit(document.source.length, document.source.length, "val next = 1")
        assertEquals(parseFile(document.source.replace('\r', '\n')), document.tree)
        assertTrue(data !== document.classificationData())
        for (input in listOf("fun f( \n", "val x = \n", "class C { \n", "val x = 1 // comment\n")) {
            val edited = IncrementalDocument(input)
            edited.edit(input.length, input.length, "\n ")
            assertEquals(parseFile(edited.source), edited.tree)
        }
        val commented = IncrementalDocument("val x = 1 // comment\n")
        commented.edit(commented.source.length - 1, commented.source.length, " ")
        assertEquals(parseFile(commented.source), commented.tree)
    }
    @Test fun editorLineEndingsPreserveImportAndSupertypeOffsets() {
        for (ending in listOf("\r\n", "\r", "\n")) {
            val source = listOf("package demo", "import other.BusinessError", "class A", "class B",
                "class Failure : RuntimeException(", "    \"message\",", "), BusinessError {",
                "    fun test(value: Any) = value is BusinessError", "}").joinToString(ending)
            val document = IncrementalDocument(source)
            val imported = source.indexOf("BusinessError")
            for (offset in listOf(source.indexOf("), BusinessError") + 3, source.lastIndexOf("BusinessError"))) {
                assertEquals(imported, document.definitionsAt(offset).single().nameStart)
            }
            assertEquals(source, document.source)
            document.edit(source.indexOf("message"), source.indexOf("message") + 7, "updated")
            assertTrue(document.reparsedFrom > 0)
            assertEquals(imported, document.definitionsAt(document.source.lastIndexOf("BusinessError")).single().nameStart)
            assertEquals(parseFile(document.source.replace('\r', '\n')), document.tree)
        }
    }
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
