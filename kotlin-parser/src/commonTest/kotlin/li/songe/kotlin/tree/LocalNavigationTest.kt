package li.songe.kotlin.tree

import li.songe.kotlin.parsing.IncrementalDocument
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertContentEquals

class LocalNavigationTest {
    @Test fun fileDeclarationsAcrossUnknownReceivers() {
        check("val «appScope» by lazy { MainScope() }; class App : Application() { fun f() { Thread.handler { t, e -> ‹appScope›.launch() } } }")
        check("val appScope = scope; class App : Base() { fun f(«appScope»: Any) = handler { ‹appScope›.launch() } }")
        check("val appScope = scope; fun f() = handler { «appScope» -> ‹appScope›.launch() }")
        check("val «value» = 1; class R { val «value» = 2 }; fun f(r: R) = r.run { ‹value› }")
        check("fun «save»() {}; fun f() = handler { ::‹save› }")
        check("import other.appScope; val appScope = scope; fun f() = handler { ‹appScope›.launch() }")
        val source = "val appScope = scope; fun f() = handler { appScope.launch() }"
        val document = IncrementalDocument(source)
        assertEquals(emptyList(), DefinitionIndex(document.tree, source).definitionsAt(source.lastIndexOf("appScope")))
    }
    private fun check(marked: String) {
        val expected = mutableListOf<Int>()
        val source = StringBuilder()
        var query = -1
        var copied = 0
        for (match in Regex("«([^»]*)»|‹([^›]*)›").findAll(marked)) {
            source.append(marked.substring(copied, match.range.first))
            if (match.value.startsWith("«")) expected.add(source.length) else query = source.length
            source.append(match.groupValues[1].ifEmpty { match.groupValues[2] })
            copied = match.range.last + 1
        }
        source.append(marked.substring(copied))
        val document = IncrementalDocument(source.toString())
        val highlights = document.classificationData().copyOf()
        assertEquals(expected.sorted(), document.definitionsAt(query).map { it.nameStart }.sorted(), marked)
        assertEquals(expected.sorted(), document.definitionsAt(query).map { it.nameStart }.sorted(), "cached: $marked")
        assertContentEquals(highlights, document.classificationData())
        document.edit(0, 0, "// edit\n")
        assertEquals(expected.map { it + 8 }.sorted(), document.definitionsAt(query + 8).map { it.nameStart }.sorted(), "edited: $marked")
    }

    @Test fun localIdentityAndVisibility() {
        check("class User { fun save() {} }; fun f() { class User { fun «save»() {} }; val user = User(); user.‹save›() }")
        check("class User { fun save() {} }; fun f() { class User { fun «save»() {} }; val user = User(); val alias = user; alias.‹save›() }")
        check("class User { fun save() {} }; fun f() { class User { fun «save»() {} }; fun g(user: User) = user.‹save›() }")
        check("class User { private fun save() {} }; fun f(user: User) = user.‹save›()")
        check("class User { private fun «save»() {}; fun f(user: User) = user.‹save›() }")
        check("object Store { private object Inner { fun save() {} } }; fun f() = Store.Inner.‹save›()")
        check("class User { fun save() {} }; fun User() = 1; fun f() { val user = User(); user.‹save›() }")
    }

    @Test fun memberReferencesAndReceiverCandidates() {
        check("object S { val «value» = 1; fun f() = lock { ‹value› } }")
        check("object S { fun «save»() {}; fun f() = lock { ::‹save› } }")
        check("class User { fun «save»() {} }; val ref = User::‹save›")
        check("class User { fun «save»() {} }; fun f(user: User) = user::‹save›")
        check("class R { fun «save»() {} }; object S { fun «save»() {}; fun f(r: R) = r.run { ‹save›() } }")
        check("class R { fun save() {} }; object S { fun save() {}; fun f(r: R, «save»: () -> Unit) = r.run { ‹save›() } }")
    }

    @Test fun namedParametersAndAliases() {
        check("object S { fun save(«x»: Int) {}; fun f() = lock { save(‹x› = 1) } }")
        check("fun save(«x»: Int) {}; fun save(«x»: String) {}; fun f() = save(‹x› = 1)")
        check("fun f() { fun save(«x»: Int) {}; save(‹x› = 1) }")
        check("class User(val «name»: String); typealias Account = User; val a = Account(‹name› = \"a\")")
        check("class R { fun save(«x»: Int) {} }; object S { fun save(«x»: Int) {}; fun f(r: R) = r.run { save(‹x› = 1) } }")
        check("typealias A = B; typealias B = A; val a = A(‹x› = 1)")
    }
}
