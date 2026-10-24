package li.songe.kotlin.parsing

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import li.songe.kotlin.builder.OfficialBuilder
import li.songe.kotlin.tree.jsonString
import li.songe.kotlin.tree.toJson
import li.songe.kotlin.tree.SyntaxNode
import org.jetbrains.kotlin.parsing.KotlinParsing
import org.jetbrains.kotlin.parsing.SemanticWhitespaceAwarePsiBuilder
import org.jetbrains.kotlin.parsing.SemanticWhitespaceAwarePsiBuilderImpl

class ParserOracleTest {
    private fun assertTree(expected: SyntaxNode, actual: SyntaxNode, context: String) {
        assertEquals(expected.copy(children = emptyList()), actual.copy(children = emptyList()), context)
        assertEquals(expected.children.size, actual.children.size, "$context children\nexpected=$expected\nactual=$actual")
        expected.children.indices.forEach { i -> assertTree(expected.children[i], actual.children[i], "$context/${expected.kind}[$i]") }
    }
    @Test fun matchesOfficialNonLazyFileTrees() {
        val factory = KotlinParsing::class.java.getDeclaredMethod("createForTopLevelNonLazy", SemanticWhitespaceAwarePsiBuilder::class.java).apply { isAccessible = true }
        val parseFileMethod = KotlinParsing::class.java.getDeclaredMethod("parseFile").apply { isAccessible = true }
        val parseScriptMethod = KotlinParsing::class.java.getDeclaredMethod("parseScript").apply { isAccessible = true }
        val projectSources = File("src/commonMain").walkTopDown().filter { it.extension == "kt" && it.name !in setOf("LexerTables.kt", "LexerActions.kt") }
            .sortedBy { it.path }.map { it.readText().replace("\r\n", "\n") }.toList()
        val editedSources = ExpressionCases.sources.take(12).flatMap { body ->
            val original = "class A {}\nclass B {}\nclass C {}\n" + body
            listOf("x", "/*", "\n}").map { insertion ->
                val document = IncrementalDocument(original)
                document.edit(original.length - 1, original.length, insertion)
                assertEquals(parseFile(document.source), document.tree)
                document.source
            }
        }
        val fixtures = ((ParserCases.sources + projectSources + editedSources).map { it to false } + ControlCases.scripts.map { it to true }).map { (source, script) ->
            OfficialBuilder.withBuilder(source) { b ->
                // Upstream recovery closes an outer import marker before dropping a temporary inner one.
                // This is valid in normal parser mode but rejected by PsiBuilder's optional heavy checks.
                b.setDebugMode(false)
                (if (script) parseScriptMethod else parseFileMethod).invoke(factory.invoke(null, SemanticWhitespaceAwarePsiBuilderImpl(b)))
                val official = OfficialBuilder.tree(b.lightTree)
                val portable = try { if (script) parseScript(source) else parseFile(source) } catch (e: Exception) { throw AssertionError("Source: ${jsonString(source)} script=$script", e) }
                assertTree(official, OfficialBuilder.normalize(portable), "Source: ${jsonString(source)} script=$script")
                "{\"source\":${jsonString(source)},\"script\":$script,\"tree\":${portable.toJson()}}"
            }
        }
        File("build/oracle").mkdirs()
        File("build/oracle/parser.json").writeText(fixtures.joinToString(prefix = "[", postfix = "]"))
        println("Compared ${fixtures.size} file trees with official non-lazy Kotlin parser")
    }
}
