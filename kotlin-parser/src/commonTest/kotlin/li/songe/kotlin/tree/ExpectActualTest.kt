package li.songe.kotlin.tree

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import li.songe.kotlin.parsing.parseFile

class ExpectActualTest {
    @Test fun recordsContextTypesWithoutParameterNamesAndKeepsNestedGenericTypes() {
        val source = "context(first: List<T>, _: String) expect fun <T> load(value: Outer<T>.Inner)"
        val json = parseFile(source).fileSymbolsJson(source)
        assertContains(json, "\"contexts\":[[\"List\", \"<\", \"#T0\", \">\"], [\"String\"]]")
        assertContains(json, "\"parameters\":[[\"Outer\", \"<\", \"#T0\", \">\", \".\", \"Inner\"]]")
        assertFalse(json.contains("\"first\""))
    }

    @Test fun recordsExplicitAndImplicitDeclarationsWithoutEnteringBodies() {
        for (eol in listOf("\n", "\r\n")) {
            val source = listOf("// 😀", "expect class Box<T>(value: T) {", "  val value: T",
                "  fun read(): T", "  companion object { fun create(): Box<Int> }", "}",
                "actual fun String.convert(values: List<String>, vararg flags: Int): String {",
                "  val actual = \"expect class Fake\"", "  return this", "}").joinToString(eol)
            val json = parseFile(source.replace('\r', '\n')).fileSymbolsJson(source)
            assertContains(json, "\"name\":\"<init>\",\"kind\":\"CONSTRUCTOR\"")
            assertContains(json, "\"path\":[\"Box\", \"Companion\", \"create\"]")
            assertContains(json, "\"parameters\":[[\"#T0\"]]")
            assertContains(json, "\"receiver\":[\"String\"]")
            assertContains(json, "\"parameters\":[[\"List\", \"<\", \"String\", \">\"], [\"vararg\", \"Int\"]]")
            val offset = source.indexOf("actual fun")
            assertContains(json, "\"role\":\"actual\",\"keyword\":[$offset,${offset + 6}]")
            assertEquals(6, Regex("\"role\":\"expect\"").findAll(json).count())
            assertEquals(1, Regex("\"role\":\"actual\"").findAll(json).count())
            assertFalse(json.contains("\"name\":\"actual\""))
            assertFalse(json.contains("\"name\":\"Fake\""))
        }
    }

    @Test fun actualMembersNeedTheirOwnModifier() {
        val source = "actual class Box actual constructor(actual val value: Int) { actual fun read() = value; fun extra() = 0 }"
        val json = parseFile(source).fileSymbolsJson(source)
        assertEquals(4, Regex("\"role\":\"actual\"").findAll(json).count())
        assertContains(json, "\"name\":\"extra\"")
    }

    @Test fun annotationPrimaryConstructorInheritsActualWithoutAKeyword() {
        val source = "actual annotation class Tag(actual val value: String)"
        val json = parseFile(source).fileSymbolsJson(source)
        assertContains(json, "\"name\":\"<init>\",\"kind\":\"CONSTRUCTOR\"")
        val start = source.indexOf('(')
        assertContains(json, "\"nameStart\":$start,\"nameEnd\":${start + 1},\"expectActual\":{\"role\":\"actual\",\"keyword\":null")
        assertContains(json, "\"parameters\":[[\"String\"]]")
        assertEquals(3, Regex("\"role\":\"actual\"").findAll(json).count())
        val ordinary = "actual class Ordinary(value: String)"
        assertFalse(parseFile(ordinary).fileSymbolsJson(ordinary).contains("CONSTRUCTOR"))
    }

    @Test fun declarationsWithoutModifiersHaveNoMultiplatformMetadata() {
        val source = "class Plain(value: Int) { fun actual() = 1 }; fun expect() = \"actual\""
        val json = parseFile(source).fileSymbolsJson(source)
        assertFalse(json.contains("expectActual"))
        assertFalse(json.contains("CONSTRUCTOR"))
    }
}
