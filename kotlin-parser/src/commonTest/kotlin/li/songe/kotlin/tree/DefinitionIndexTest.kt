package li.songe.kotlin.tree

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import li.songe.kotlin.parsing.IncrementalDocument

class DefinitionIndexTest {
    @Test fun enclosingMemberCallCandidatesDoNotChangeStrictBindings() {
        check("object Store { fun export() = mutex.withLock { Result(file = ‹archive›(1)) }; private fun «archive»(id: Int) = id }")
        check("object Store { fun export() = lock { lock { ‹archive›() } }; fun «archive»() = 1; fun «archive»(x: Int) = x }")
        check("class Store { fun archive() = 1; fun export(«archive»: () -> Int) = lock { ‹archive›() } }")
        check("class Store { fun archive() = 1; class Nested { fun export() = lock { ‹archive›() } } }")
        check("class Store { fun «archive»() = 1; inner class Nested { fun export() = lock { ‹archive›() } } }")
        check("class Store { fun String.archive() = 1; fun export() = lock { ‹archive›() } }")
        val source = "object Store { fun archive() = 1; fun export() = lock { archive() } }"
        val document = IncrementalDocument(source)
        val offset = source.lastIndexOf("archive")
        val index = DefinitionIndex(document.tree, source)
        assertTrue(index.definitionsAt(offset).isEmpty())
        assertEquals(source.indexOf("archive"), document.definitionsAt(offset).single().nameStart)
        document.edit(source.indexOf("archive"), source.indexOf("archive") + 7, "renamed")
        assertTrue(document.definitionsAt(offset).isEmpty())
    }
    @Test fun explicitTypeReceiversAcrossInheritedScopes() {
        check("class Failure : Base() { val reason get() = ‹Reason›.Invalid }; enum class «Reason» { Invalid }")
        check("enum class Reason { Invalid }; class Failure : Base() { fun f(«Reason»: Any) = ‹Reason›.Invalid }")
        check("val «value» = 1; class Failure : Base() { val result get() = ‹value› }")
    }
    // «declaration» and ‹reference› markers are removed before parsing.
    private fun check(marked: String, script: Boolean = false) {
        val source = StringBuilder()
        val expected = mutableListOf<Pair<Int, Int>>()
        var query = -1
        var copied = 0
        for (match in Regex("«([^»]*)»|‹([^›]*)›").findAll(marked)) {
            source.append(marked.substring(copied, match.range.first))
            val text = match.groupValues[1].ifEmpty { match.groupValues[2] }
            if (match.value.startsWith("«")) expected.add(source.length to source.length + text.length)
            else query = source.length
            source.append(text)
            copied = match.range.last + 1
        }
        source.append(marked.substring(copied))
        assertTrue(query >= 0, marked)
        val document = IncrementalDocument(source.toString(), script)
        val targets = document.definitionsAt(query)
        assertEquals(expected, targets.map { it.nameStart to it.nameEnd }, marked)
        targets.forEach { assertTrue(it.start <= it.nameStart && it.nameEnd <= it.end && it.end <= source.length) }
        assertEquals(targets, document.definitionsAt(query), "Repeated query: $marked")
    }

    @Test fun parametersLocalsAndCaptures() {
        check("fun f(«name»: String) = ‹name›")
        check("fun f(«name»: String) { println(\"Hello, ${'$'}‹name›\") }")
        check("fun f(«x»: Int) { if (true) { val x = 2 }; println(‹x›) }")
        check("fun f(x: Int) { val «x» = 2; println(‹x›) }")
        check("fun f(«x»: Int) { val x = ‹x› }")
        check("fun f(«x»: Int) { use { q -> ‹x› + q } }")
        check("fun f(x: Int) { use { «x» -> ‹x› } }")
        check("fun f() { val «x» = 2; fun nested() = ‹x› }")
        check("fun f() { println(‹later›); val later = 2 }")
        check("fun f(«x»: Int, y: Int = ‹x›) {}")
        check("fun f(x: Int = ‹later›, later: Int = 1) {}")
        check("fun f(«`a b`»: Int) = ‹`a b`›")
        check("fun f(«name»: String) { // 😀\r\n println(‹name›)")
    }

    @Test fun filesImportsAndTypes() {
        check("class «User»\nval value = ‹User›()")
        check("class «User»\nval value = run { ‹User›() }")
        check("class «User»<T>\nval value = run { ‹User›<String>() }")
        check("class User\ntypealias «Account» = User\nval value = run { ‹Account›() }")
        check("class «User»\nfun String.create() = ‹User›()")
        check("class User\nfun f(«User»: () -> Int) = run { ‹User›() }")
        check("fun «helper»() = 1\nval value = run { ‹helper›() }")
        check("fun f() = ‹later›\nval «later» = 1")
        check("fun «f»(x: Int) = x\nfun «f»(x: String) = x\nval y = ‹f›(1)")
        check("import example.«User»\nfun f(x: ‹User›) = x")
        check("import example.User as «Account»\nfun f(x: ‹Account›) = x")
        check("import example.User as Account\nfun f(x: ‹User›) = x")
        check("import example.*\nfun f(x: ‹User›) = x")
        check("import example.value\nfun f(«value»: Int) = ‹value›")
        check("import example.value\nval value = 1\nfun f() = ‹value›")
        check("import example.«User»\nfun f(User: Int, x: ‹User›) = x")
        check("class «User»\nfun f() = ‹User›()")
        check("typealias «Alias» = String\nfun f(x: ‹Alias›) = x")
        check("fun <«T»> f(x: ‹T›) = x")
        check("import example.«Outer»\nval x: ‹Outer›.Inner? = null")
        check("import example.Inner\nval x: Outer.‹Inner›? = null")
        check("import example.«T»\nval x: Outer.Inner<‹T›>? = null")
        check("val «x» = 1\nprintln(‹x›)", script = true)
        check("println(‹x›)\nval x = 1", script = true)
    }

    @Test fun controlScopesAndMembers() {
        check("fun f() { for («x» in xs) println(‹x›) }")
        check("fun f(«x»: List<Int>) { for (x in ‹x›) {} }")
        check("fun f() { for (x in xs) {}; println(‹x›) }")
        check("fun f() { try {} catch («e»: Exception) { println(‹e›) } }")
        check("fun f() { try {} catch (e: Exception) {}; println(‹e›) }")
        check("fun f() { val («a», b) = pair; println(‹a›) }")
        check("fun f() { use { («a», b) -> ‹a› } }")
        check("fun f() { when (val «x» = 1) { else -> ‹x› } }")
        check("fun f() { when (val x = 1) { else -> x }; println(‹x›) }")
        check("class C(val «x»: Int) { fun f() = ‹x› }")
        check("class C(«x»: Int) { val y = ‹x› }")
        check("class C(«x»: Int) { init { println(‹x›) } }")
        check("class C(x: Int) { fun f() = ‹x› }")
        check("class C(x: Int) { val y get() = ‹x› }")
        check("class C { fun f() = ‹x›; val «x» = 1 }")
        check("class C { val x = 1; class Nested { fun f() = ‹x› } }")
        check("class C { val «x» = 1; inner class Nested { fun f() = ‹x› } }")
        check("class C { var x = 0; set(«v») { println(‹v›) } }")
        check("fun f() { val «x» = 1; class C { val x = 2; fun g() = ‹x› } }")
        check("enum class E { «A», B; fun f() = ‹A› }")
    }

    @Test fun unsupportedNamesDoNotGuess() {
        check("val name = 1\nfun f(value: ExternalType) = value.‹name›")
        check("import example.foo\nfun f(obj: Any) = obj.‹foo›()")
        check("import example.foo\nfun f(obj: Any) = obj?.‹foo›()")
        check("import example.foo\nfun f(obj: Any) = obj::‹foo›")
        check("fun f(«obj»: Any) = ‹obj›.member")
        check("fun f(«x»: Int) = obj.foo(‹x›)")
        check("fun f(«x»: Int) = obj?.foo(‹x›)")
        check("fun f(x: Int) = foo(‹x› = 1)")
        check("fun f(it: Int) { use { ‹it› } }")
        check("fun f(«it»: Int) { use { explicit -> ‹it› } }")
        check("import example.foo\nfun f() { use { ‹foo›() } }")
        check("val «x» = 1\nfun External.f() = ‹x›")
        check("fun String.ext() = 1\nfun f() = ‹ext›()")
        check("fun f() { val callback: (label: Int) -> Unit; println(‹label›) }")
        check("val field = 1\nclass C { var x = 0; get() = ‹field› }")
        check("val value = 1\nclass C { var x = 0; set(«value») { println(‹value›) } }")
        check("import example.f\nfun f() {}\nfun g() = ‹f›()")
        check("fun f(«x»: Int) { val y = fun External.() = ‹x› }")
        check("val «x» = 1\nval y = fun External.() = ‹x›")
    }

    @Test fun editsInvalidateTheIndex() {
        val document = IncrementalDocument("fun f(x: Int) = x")
        assertEquals(6, document.definitionsAt(16).single().nameStart)
        document.edit(0, 0, "// 😀\r\n")
        assertEquals(13, document.definitionsAt(23).single().nameStart)
        document.edit(13, 14, "y")
        assertEquals(emptyList(), document.definitionsAt(23))
        assertEquals(emptyList(), document.definitionsAt(-1))
        assertEquals(emptyList(), document.definitionsAt(document.source.length))
    }
}
