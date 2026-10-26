package li.songe.kotlin.tree

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertFalse
import kotlin.test.assertEquals
import kotlin.test.assertNull
import li.songe.kotlin.parsing.parseFile

class FileSymbolsTest {
    @Test fun objectMembersHaveQualifiedPathsAndRespectVisibility() {
        val source = """
            package li.gkd.db
            object Db {
                internal val database by lazy { 1 }
                private val hidden = 2
                object Nested { val value = 3 }
                private object Secret { val secret = 4 }
                fun method() { val local = 5 }
            }
            class Instance { val database = 6 }
        """.trimIndent()
        val json = parseFile(source).fileSymbolsJson(source)
        assertContains(json, "\"path\":[\"Db\", \"database\"]")
        assertContains(json, "\"path\":[\"Db\", \"Nested\", \"value\"]")
        for (name in listOf("local")) assertFalse(json.contains("\"name\":\"$name\""))
        assertContains(json, "\"path\":[\"Instance\", \"database\"]")
    }
    @Test fun unresolvedReferencesRespectLexicalBoundaries() {
        fun reference(source: String, word: String) = DefinitionIndex(parseFile(source), source).externalReferenceAt(source.lastIndexOf(word))
        assertEquals(ExternalReference("User", true), reference("val value: User? = null", "User"))
        assertEquals(ExternalReference("helper", false), reference("fun use() = helper()", "helper"))
        assertNull(reference("fun use(helper: Int) = helper", "helper"))
        assertNull(reference("fun use(value: Any) = value.helper()", "helper"))
        assertEquals(ExternalReference("helper", true, constructorOnly = true), reference("fun use() = run { helper() }", "helper"))
        assertEquals(ExternalReference("Account", false, importOnly = true), reference("import other.User as Account\nval value = run { Account() }", "Account"))
        assertEquals(ExternalReference("toJson5String", false, importOnly = true), reference("import example.Json.toJson5String\nval value by lazy { toJson5String(this) }", "toJson5String"))
        assertEquals(ExternalReference("json", false, importOnly = true), reference("import example.Json.json\nval value by lazy { json.encode(this) }", "json"))
        assertNull(reference("import example.Json.toJson5String\nfun f(toJson5String: () -> Unit) = run { toJson5String() }", "toJson5String"))
        assertNull(reference("fun use() = run { it }", "it"))
        assertNull(reference("import other.User\nval value: User? = null", "User"))
        assertNull(reference("// User", "User"))
        assertNull(reference("val text = \"User\"", "User"))
    }
    @Test fun extractsOnlyImportPathsAndVisibleTopLevelDeclarations() {
        val source = """
            package com.`odd-name`
            import other.User as Account
            import other.*
            private class Hidden
            class Visible { class Nested }
            fun work() { val local = 1 }
            val answer = 42
            typealias Alias = Visible
        """.trimIndent()
        val json = parseFile(source).fileSymbolsJson(source)
        assertContains(json, "\"packageName\":[\"com\", \"odd-name\"]")
        assertContains(json, "\"path\":[\"other\", \"User\"]")
        assertContains(json, "\"name\":\"Account\",\"star\":false")
        for (name in listOf("Visible", "work", "answer", "Alias")) assertContains(json, "\"name\":\"$name\"")
        for (name in listOf("local", "Account")) assertFalse(json.contains("\"name\":\"$name\",\"kind\""))
        val starImport = "import other.*"
        assertContains(parseFile(starImport).fileSymbolsJson(starImport), "\"star\":true")
    }
}
