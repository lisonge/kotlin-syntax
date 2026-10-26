package li.songe.kotlin.parsing

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import li.songe.kotlin.lexer.tokenize
import li.songe.kotlin.tree.classifySyntax
import li.songe.kotlin.tree.toJson

class PortabilityTest {
    @Test fun unicodeAndPartialSurrogateEdits() {
        val texts = listOf("中文", "e\u0301", "\uD801\uDC00", "\uD83D\uDE00", "\uD800", "\uDC00", "\u0000", "\u2028\u2029", "İıß")
        for (text in texts) {
            val source = "val `名$text` = \"$text\"\r\n/* $text */"
            assertEquals(source, tokenize(source).joinToString("") { source.substring(it.start, it.end) })
            for (script in listOf(false, true)) {
                val document = IncrementalDocument("", script)
                for (length in (0..source.length) + (source.length downTo 0)) {
                    val next = source.take(length)
                    document.edit(0, document.source.length, next)
                    val normalized = next.replace('\r', '\n')
                    val fresh = if (script) parseScript(normalized) else parseFile(normalized)
                    assertEquals(fresh.toJson(), document.tree.toJson())
                    assertEquals(fresh.classifySyntax(), document.tree.classifySyntax())
                }
            }
        }
    }

    @Test fun nestedExpressionsTypesBlocksAndComments() {
        for (depth in listOf(8, 32, 64)) {
            val sources = listOf(
                "val x = " + "(".repeat(depth) + "1" + ")".repeat(depth),
                "val x: " + "List<".repeat(depth) + "Int" + ">".repeat(depth) + " = TODO()",
                "fun f() { " + "if (true) { ".repeat(depth) + "println(1)" + "}".repeat(depth + 1),
                "/*".repeat(depth) + "中\uD83D\uDE00" + "*/".repeat(depth) + "\nval x = 1",
            )
            for (source in sources) for (script in listOf(false, true)) {
                val document = IncrementalDocument(source, script)
                assertTrue(document.tree.classifySyntax().isNotEmpty())
                document.edit(source.length, source.length, "\nval tail = 2")
                val fresh = if (script) parseScript(document.source) else parseFile(document.source)
                assertEquals(fresh.toJson(), document.tree.toJson())
                assertEquals(fresh.classifySyntax(), document.tree.classifySyntax())
            }
        }
    }
}
