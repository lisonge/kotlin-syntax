package li.songe.kotlin.tree

import kotlin.test.Test
import kotlin.test.assertEquals
import li.songe.kotlin.parsing.IncrementalDocument

class LocalClassificationsTest {
    @Test fun capitalizedIntermediateReceivers() {
        for (expression in listOf("Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES", "Settings.Secure.read()", "Settings /* a */ . Secure /* b */ .VALUE", "Settings.`Secure`.VALUE")) {
            val source = "val result = $expression"
            val document = IncrementalDocument(source)
            assertEquals(TokenType.CLASS, type(document, source.indexOf("Settings")), expression)
            assertEquals(TokenType.CLASS, type(document, source.indexOf("Secure") - if (expression.contains("`Secure`")) 1 else 0), expression)
        }
        for (expression in listOf("factory().Secure.VALUE", "Settings.make().Secure.VALUE", "Settings?.Secure.VALUE", "Settings.SECURE.VALUE")) {
            val source = "val result = $expression"
            val name = if (expression.contains("SECURE")) "SECURE" else "Secure"
            assertEquals(TokenType.VARIABLE, type(IncrementalDocument(source), source.indexOf(name)), expression)
        }
        val source = "object Settings { val Secure = external }; val value = Settings.Secure.VALUE"
        assertEquals(TokenType.PROPERTY, type(IncrementalDocument(source), source.lastIndexOf("Secure")))
        val unknown = "val value = Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES"
        val document = IncrementalDocument(unknown)
        assertEquals(TokenType.VARIABLE, type(document, unknown.indexOf("ENABLED_ACCESSIBILITY_SERVICES")))
        val dot = unknown.indexOf(".Secure")
        document.edit(dot, dot, "()")
        assertEquals(TokenType.VARIABLE, type(document, document.source.indexOf("Secure")))
    }
    @Test fun capitalizedReceiverFallback() {
        for (name in listOf("SnapshotStore", "URLParser", "Écran", "`FileExports`")) {
            val source = "fun f() = $name /* receiver */ .make<String>()"
            assertEquals(TokenType.CLASS, type(IncrementalDocument(source), source.indexOf(name)), source)
        }
        for (expression in listOf("Dispatchers.IO", "Db.snapshotDao", "Db.snapshotDao.save()", "`Db`.snapshotDao", "Store /* comment */ .value")) {
            val source = "val result = $expression"
            assertEquals(TokenType.CLASS, type(IncrementalDocument(source), source.indexOf(expression)), source)
        }
        for (expression in listOf("MAX_SIZE.make()", "DEBUG.make()", "HTTP2.make()", "A.make()", "lower.make()", "MAX_SIZE.value", "HTTP2.value", "lower.value", "Store?.make()", "Store?.value", "Store::make", "Store", "`MAX_SIZE`.make()")) {
            val source = "val result = $expression"
            assertEquals(TokenType.VARIABLE, type(IncrementalDocument(source), source.indexOf(expression)), source)
        }
        for ((source, expected) in listOf(
            "fun f(Store: Any) = Store.make()" to TokenType.PARAMETER,
            "fun f() { val Store = external; Store.make() }" to TokenType.VARIABLE,
            "val Store = external; fun f() = Store.make()" to TokenType.PROPERTY,
            "val result = Store()" to TokenType.FUNCTION,
            "fun f(Store: Any) = Store.value" to TokenType.PARAMETER,
            "fun f() { val Store = external; Store.value }" to TokenType.VARIABLE,
            "val Store = external; fun f() = Store.value" to TokenType.PROPERTY,
        )) assertEquals(expected, type(IncrementalDocument(source), source.lastIndexOf("Store")), source)
        val source = "fun f() { Store.make() }"
        val document = IncrementalDocument(source)
        assertEquals(TokenType.CLASS, type(document, source.indexOf("Store")))
        val insertion = "val Store = external; "
        document.edit(source.indexOf("Store"), source.indexOf("Store"), insertion)
        assertEquals(TokenType.VARIABLE, type(document, source.indexOf("Store") + insertion.length))
    }
    @Test fun explicitTypeRolesShareOneClassification() {
        for (source in listOf("val x: Target? = null", "fun f(): Target = TODO()", "typealias Alias = Target",
            "fun f(x: Any) = x as? Target", "fun f(x: Any) = x !is Target", "val x: List<Target>? = null",
            "fun <T> f() where T : Target {}", "fun Target.ext() {}", "val x: Target.() -> Unit = {}",
            "class C : Target()", "val x = object : Target() {}")) {
            assertEquals(TokenType.TYPE, type(IncrementalDocument(source), source.indexOf("Target")), source)
        }
        val annotation = "@Target(value = x as Other) class C"
        assertEquals(TokenType.DECORATOR, type(IncrementalDocument(annotation), annotation.indexOf("Target")))
        assertEquals(TokenType.TYPE, type(IncrementalDocument(annotation), annotation.indexOf("Other")))
    }
    @Test fun importedTypeEvidenceRespectsAliasesAndShadowing() {
        val source = "import other.Message as Msg; class Failure : IllegalArgumentException(), Base { val error: Msg get() = Msg.WithDetail(); fun f(Msg: Any) = Msg.toString() }"
        val document = IncrementalDocument(source)
        assertEquals(TokenType.TYPE, type(document, source.indexOf("IllegalArgumentException")))
        assertEquals(TokenType.TYPE, type(document, source.indexOf("Msg.WithDetail")))
        assertEquals(TokenType.FUNCTION, type(document, source.indexOf("WithDetail")))
        assertEquals(TokenType.PARAMETER, type(document, source.lastIndexOf("Msg.toString")))
    }
    @Test fun typeEvidenceStaysInScopeAndDoesNotGuessCallsOrClassLiterals() {
        val source = "fun first(x: Any) { x as Target; Target.make() }; fun second() = Target.make(); val c = Unknown::class; val d = Capitalized()"
        val document = IncrementalDocument(source)
        assertEquals(TokenType.TYPE, type(document, source.indexOf("Target.make")))
        assertEquals(TokenType.CLASS, type(document, source.lastIndexOf("Target.make")))
        assertEquals(TokenType.VARIABLE, type(document, source.indexOf("Unknown")))
        assertEquals(TokenType.FUNCTION, type(document, source.indexOf("Capitalized")))
    }
    @Test fun qualifiedTypeDoesNotTurnPackageIntoType() {
        val source = "val x: example.Target? = null; val y = example.factory()"
        assertEquals(TokenType.VARIABLE, type(IncrementalDocument(source), source.lastIndexOf("example")))
    }
    private fun type(document: IncrementalDocument, offset: Int): TokenType {
        val data = document.classificationData()
        val position = data.indices.step(4).first { data[it] == offset }
        return TokenType.entries[data[position + 2]]
    }
    @Test fun enumReferencesAndLocalShadowing() {
        val source = "class Failure : Base() { val reason get() = Reason.Invalid }; enum class Reason { Invalid }; fun f(Reason: Any) = Reason.Invalid"
        val document = IncrementalDocument(source)
        assertEquals(TokenType.ENUM, type(document, source.indexOf("Reason.Invalid")))
        assertEquals(TokenType.ENUM_MEMBER, type(document, source.indexOf("Reason.Invalid") + 7))
        assertEquals(TokenType.PARAMETER, type(document, source.lastIndexOf("Reason.Invalid")))
        assertEquals(TokenType.VARIABLE, type(document, source.lastIndexOf("Invalid")))
        val offset = source.indexOf("enum class Reason")
        document.edit(offset, offset + "enum class Reason { Invalid }".length, "class Different")
        assertEquals(TokenType.CLASS, type(document, source.indexOf("Reason.Invalid")))
    }
    @Test fun objectsNestedTypesAndExternalNames() {
        val source = "import external.Remote; object Config { val enabled = true }; class Outer { class Inner }; val a = Config.enabled; val b: Outer.Inner? = null; fun f(p: Remote) = p"
        val document = IncrementalDocument(source)
        assertEquals(TokenType.CLASS, type(document, source.indexOf("Config.enabled")))
        assertEquals(TokenType.PROPERTY, type(document, source.indexOf("Config.enabled") + 7))
        assertEquals(TokenType.CLASS, type(document, source.indexOf("Outer.Inner") + 6))
        assertEquals(TokenType.TYPE, type(document, source.lastIndexOf("Remote")))
        assertEquals(TokenType.PARAMETER, type(document, source.lastIndexOf("p")))
    }
}
