package li.songe.kotlin.tree

import kotlin.test.Test
import kotlin.test.assertEquals
import li.songe.kotlin.parsing.IncrementalDocument

class LocalTypeAnalysisTest {
    private val user = "open class User(val name: String) { fun save() {} }; class Other(val other: Int); "
    private fun check(marked: String, expected: TokenType) {
        val offset = marked.indexOf('«')
        val source = marked.replace("«", "").replace("»", "")
        val data = IncrementalDocument(source).classificationData()
        val span = data.indices.step(4).first { data[it] == offset }
        assertEquals(expected, TokenType.entries[data[span + 2]], marked)
    }
    @Test fun explicitTypesConstructorsAndStableAliases() {
        for (body in listOf("fun f(u: User) = u.«name»", "fun f(u: User?) = u?.«name»",
            "fun f() { val u = User(\"x\"); u.«name» }", "fun f() { val u = User(\"x\"); val alias = u; alias.«name» }",
            "typealias Person = User; fun f(p: Person) = p.«name»", "fun f() { var u: User = User(\"x\"); u.«name» }")) check(user + body, TokenType.PROPERTY)
        check(user + "fun f(u: User) = u.«save»()", TokenType.METHOD)
        check(user + "fun f() { var u = User(\"x\"); u = unknown(); u.«name» }", TokenType.VARIABLE)
        check(user + "fun f(User: () -> Any) { val u = User(); u.«name» }", TokenType.VARIABLE)
        check(user + "fun f(u: External) = u.«name»", TokenType.VARIABLE)
    }
    @Test fun thisNamedArgumentsAndInheritance() {
        check(user + "class Child : User(\"x\") { fun f() = this.«name» }", TokenType.PROPERTY)
        check(user + "class Child : User(\"x\"); fun f(c: Child) = c.«save»()", TokenType.METHOD)
        check(user + "class Child : User(\"x\") { fun f() = «name» }", TokenType.PROPERTY)
        check(user + "class Child : User(\"x\") { fun f() = «save»() }", TokenType.METHOD)
        check(user + "class Child : User(\"x\") { fun f(name: Int) = «name» }", TokenType.PARAMETER)
        check("class C { val name = 1; fun f() = this.«name» }", TokenType.PROPERTY)
        check(user + "fun User.f() = this.«name»", TokenType.PROPERTY)
        check("class C { val name = 1; fun f() = run { this.«name» } }", TokenType.VARIABLE)
        check("class C { companion object { val name = 1; fun f() = this.«name» } }", TokenType.PROPERTY)
        check(user + "val u = User(«name» = \"x\")", TokenType.PARAMETER)
        check("fun unknown() = external(«name» = 1)", TokenType.PARAMETER)
        check("class A : B(); class B : A(); fun f(a: A) = a.«missing»", TokenType.VARIABLE)
        check("interface A { val name: String }; interface B { val name: String }; class C : A, B; fun f(c: C) = c.«name»", TokenType.VARIABLE)
    }
    @Test fun branchNarrowingAndExplicitCasts() {
        for (body in listOf("fun f(x: Any) { if (x is User) x.«name» }",
            "fun f(x: Any) { if (x !is User) {} else x.«name» }",
            "fun f(x: Any) = when(x) { is User -> x.«name»; else -> null }",
            "fun f(x: Any) = when { x is User -> x.«name»; else -> null }",
            "fun f(x: Any) = (x as User).«name»", "fun f(x: Any) = (x as? User)?.«name»",
            "fun f(x: Any) { if (x is User) { val alias = x; alias.«name» } }")) check(user + body, TokenType.PROPERTY)
        check(user + "fun f(x: Any) { if (x is User) {} else x.«name» }", TokenType.VARIABLE)
        check(user + "fun f(x: Any) { if (x is User) {}; x.«name» }", TokenType.VARIABLE)
        check(user + "fun f(x: Any) = x is User && x.«name».isNotEmpty()", TokenType.PROPERTY)
        check(user + "fun f(x: Any) = x !is User || x.«name».isNotEmpty()", TokenType.PROPERTY)
        check(user + "fun f(x: Any) { if (x is User || external()) x.«name» }", TokenType.VARIABLE)
        check(user + "fun f(x: Any) { if (x is User) { val x: Other = Other(1); x.«name» } }", TokenType.VARIABLE)
        check(user + "fun f() { var x: Any = User(\"x\"); if (x is User) x.«name» }", TokenType.VARIABLE)
        check(user + "fun f(x: Any) = when(x) { !is User -> x.«name»; else -> null }", TokenType.VARIABLE)
    }
}
