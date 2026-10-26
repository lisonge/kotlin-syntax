package li.songe.kotlin.tree

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import li.songe.kotlin.parsing.parseFile

class NavigationQueryTest {
    @Test fun annotatedNestedTypesKeepTheirDeclarationIdentity() {
        val source = "class Outer { class Inner }; fun f(value: Outer.Inner) = value.member"
        val result = query(source, "member")
        assertContains(result, "\"bindingStart\":6")
        assertContains(result, "\"typeMembers\":[\"Inner\"]")
    }
    @Test fun callableReferencesAndNamedArguments() {
        assertContains(query("val f = Store::remove", "remove"), "\"members\":[\"remove\"]")
        assertContains(query("val f = run { Store.create() }", "create"), "\"typeOnly\":true")
        assertContains(query("val f = Exports.withFile(create = { Store.create() })", "create ="), "\"parameter\":\"create\"")
        assertContains(query("fun make(create: Int) = create; val f = make(create = 1)", "create ="), "\"parameter\":\"create\"")
        val source = "import example.save\nval f = ::save"
        val tree = parseFile(source)
        assertEquals(1, DefinitionIndex(tree, source).definitionsAt(source.lastIndexOf("save")).size)
        val shadow = "fun f(Store: Int) = run { Store.create() }"
        assertContains(query(shadow, "create"), "\"path\":[\"Int\"],\"mode\":\"instance\"")
        assertEquals("null", query("fun f() = run { Store -> Store.create() }", "create"))
        val bare = "val f = run { unknown }"
        assertEquals(null, DefinitionIndex(parseFile(bare), bare).externalReferenceAt(bare.indexOf("unknown")))
        assertContains(query("val value: example.Model? = null", "Model"), "\"typeOnly\":false")
    }
    private fun query(source: String, name: String): String {
        val tree = parseFile(source)
        return tree.navigationQueryJson(source, source.lastIndexOf(name), DefinitionIndex(tree, source))
    }

    @Test fun explicitAndConstructorReceivers() {
        assertContains(query("fun f(p: Person?) = p?.name", "name"), "\"mode\":\"instance\"")
        assertContains(query("fun f() { val p = Person(); p.name }", "name"), "\"mode\":\"constructor\"")
        assertContains(query("class Person(val name: String) { fun f() = this.name }", "name"), "\"bindingStart\":6")
        assertContains(query("fun f() { val p = Person(); val alias = p; alias.name }", "name"), "\"mode\":\"constructor\"")
    }

    @Test fun unknownReceiversAndCallResultsAreNotGuessed() {
        assertEquals("null", query("fun f() { val Config = 1; Config.value }", "value"))
        assertEquals("null", query("fun f(Person: () -> Any) { val p = Person(); p.name }", "name"))
        assertEquals("null", query("fun Person() = 1; fun f() { val p = Person(); p.name }", "name"))
        assertEquals("null", query("val value = Person().name", "name"))
        assertEquals("null", query("val value = Config.read().name", "name"))
    }
}
