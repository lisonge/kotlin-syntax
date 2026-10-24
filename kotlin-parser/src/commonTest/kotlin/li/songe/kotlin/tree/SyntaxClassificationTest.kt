package li.songe.kotlin.tree

import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.assertEquals
import li.songe.kotlin.parsing.IncrementalDocument
import li.songe.kotlin.parsing.parseFile
import li.songe.kotlin.parsing.parseScript

class SyntaxClassificationTest {
    private fun expect(source: String, spans: List<SyntaxClassification>, word: String, type: TokenType, modifiers: Set<TokenModifier>) {
        assertTrue(spans.any { source.substring(it.start, it.end) == word && it.type == type && it.modifiers == modifiers }, "$word in $source: $spans")
        var end = 0
        for (span in spans) {
            assertTrue(span.start >= end && span.end > span.start && span.end <= source.length)
            end = span.end
        }
    }
    @Test fun declarationsAndDamagedDocuments() {
        val sources = listOf(
            Triple("enum class Mode { ON }", "Mode", TokenType.ENUM to setOf(TokenModifier.DECLARATION)),
            Triple("abstract class Base { abstract suspend fun run() }", "run", TokenType.METHOD to setOf(TokenModifier.DECLARATION, TokenModifier.ABSTRACT, TokenModifier.ASYNC)),
            Triple("class C(val value: Int", "value", TokenType.PROPERTY to setOf(TokenModifier.DECLARATION, TokenModifier.READONLY)),
            Triple("fun f() { class Local { val member = 1 } }", "member", TokenType.PROPERTY to setOf(TokenModifier.DECLARATION, TokenModifier.READONLY)),
            Triple("fun f() { val local =", "local", TokenType.VARIABLE to setOf(TokenModifier.DECLARATION, TokenModifier.READONLY)),
            Triple("val broken =\nval healthy = 42", "healthy", TokenType.PROPERTY to setOf(TokenModifier.DECLARATION, TokenModifier.READONLY)),
            Triple("/** docs */ val x = 1", "/** docs */", TokenType.COMMENT to setOf(TokenModifier.DOCUMENTATION)),
            Triple("fun f() { loop@ while(true) break@loop }", "loop", TokenType.LABEL to emptySet())
        )
        for (script in listOf(false, true)) {
            val document = IncrementalDocument("", script)
            for ((source, word, classification) in sources) {
                document.edit(0, document.source.length, source)
                val spans = document.tree.classifySyntax()
                expect(source, spans, word, classification.first, classification.second)
                assertEquals((if (script) parseScript(source) else parseFile(source)).classifySyntax(), spans)
            }
            val full = "class C { val value = 42 }"
            for (length in (0..full.length) + (full.length downTo 0)) {
                val source = full.take(length)
                document.edit(0, document.source.length, source)
                val spans = document.tree.classifySyntax()
                assertEquals((if (script) parseScript(source) else parseFile(source)).classifySyntax(), spans)
                if (source.startsWith("class C ")) expect(source, spans, "C", TokenType.CLASS, setOf(TokenModifier.DECLARATION))
            }
        }
    }
}
