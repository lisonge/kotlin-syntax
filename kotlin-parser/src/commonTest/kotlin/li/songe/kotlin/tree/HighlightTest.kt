package li.songe.kotlin.tree

import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.assertEquals
import li.songe.kotlin.parsing.IncrementalDocument
import li.songe.kotlin.parsing.parseFile
import li.songe.kotlin.parsing.parseScript

class HighlightTest {
    private fun expect(source: String, json: String, word: String, type: Int, modifiers: Int) {
        val values = json.removePrefix("[").removeSuffix("]").split(',').filter { it.isNotEmpty() }.map { it.toInt() }.chunked(4)
        assertTrue(values.any { source.substring(it[0], it[1]) == word && it[2] == type && it[3] == modifiers }, "$word in $source: $json")
        var end = 0
        for (span in values) {
            assertTrue(span[0] >= end && span[1] > span[0] && span[1] <= source.length)
            end = span[1]
        }
    }
    @Test fun declarationsAndDamagedDocuments() {
        val sources = listOf(
            Triple("enum class Mode { ON }", "Mode", 16 to 1),
            Triple("abstract class Base { abstract suspend fun run() }", "run", 17 to 13),
            Triple("class C(val value: Int", "value", 8 to 3),
            Triple("fun f() { class Local { val member = 1 } }", "member", 8 to 3),
            Triple("fun f() { val local =", "local", 7 to 3),
            Triple("val broken =\nval healthy = 42", "healthy", 8 to 3),
            Triple("/** docs */ val x = 1", "/** docs */", 11 to 16),
            Triple("fun f() { loop@ while(true) break@loop }", "loop", 18 to 0)
        )
        for (script in listOf(false, true)) {
            val document = IncrementalDocument("", script)
            for ((source, word, classification) in sources) {
                document.edit(0, document.source.length, source)
                val json = document.tree.highlightJson()
                expect(source, json, word, classification.first, classification.second)
                assertEquals((if (script) parseScript(source) else parseFile(source)).highlightJson(), json)
            }
            val full = "class C { val value = 42 }"
            for (length in (0..full.length) + (full.length downTo 0)) {
                val source = full.take(length)
                document.edit(0, document.source.length, source)
                val json = document.tree.highlightJson()
                assertEquals((if (script) parseScript(source) else parseFile(source)).highlightJson(), json)
                if (source.startsWith("class C ")) expect(source, json, "C", 2, 1)
            }
        }
    }
}
