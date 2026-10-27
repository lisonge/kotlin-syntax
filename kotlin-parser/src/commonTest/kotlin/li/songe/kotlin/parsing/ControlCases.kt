package li.songe.kotlin.parsing

object ControlCases {
    val bodies = listOf(
        "@Suppress(\"D\")\na + b", "@A a + b", "@A\n@B\na() && b()",
        "val x = 1\nvar y = x + 2\ny += 1\nreturn y",
        "val (a, b) = pair\nval [c, d] = pair", "(val a, var b) = pair", "val (a: Int, b: Int) = pair",
        "if (x) foo() else bar()", "if (x) { return 1 } else { return 2 }", "if (x) if (y) a else b",
        "while (x) { x-- }", "while (true);", "do { x++ } while (x < 10)", "do while (true)",
        "for (x in xs) println(x)", "for ((key, value) in map) { println(value) }", "for (x: Int in xs) { continue }",
        "try { foo() } catch (e: Exception) { throw e } finally { close() }", "try {}", "try {} catch {}",
        "when (x) { 1 -> a\n2, 3 -> b\nelse -> c }", "when { a -> b\nelse -> c }",
        "when (val x = foo()) { is String -> x\nin xs -> x\n!is Int -> x\n!in ys -> x\nelse -> null }",
        "when (x) { is String if x.isNotEmpty() -> x\nelse -> null }",
        "val f = { x: Int, y: Int -> x + y }", "val f = { -> 42 }", "val f = { 42 }",
        "val f = { (a, b) -> a + b }", "val f = { x, y }", "foo { x -> x + 1 }", "foo(1) { it }",
        "foo @A label@ { return@label 1 }", "val f = fun(x: Int): Int { return x }",
        "val o = object : Base() { override fun f() = 1 }", "object Named {}", "class Local(val x: Int)",
        "outer@ while (true) { if (x) break@outer; continue@outer }", "return@label x", "return @label x",
        "val s = \"${'$'}this ${'$'}when ${'$'}{foo(1)}\"", "val f = @A { it }", "val f = foo<Int>(1)",
        "if (", "for (", "when (x) { else -> }", "while (x)", "val (a,) = pair", "val () = pair",
        "fun local() {}\nlocal()", "val x = 1; val y = 2", "val x = 1 val y = 2", "foo() bar()",
        "try { return } finally {}", "when (x) { is String && x.ok -> x }"
    )
    val files = bodies.map { "fun test() {\n$it\n}" } + listOf(
        "fun f(x: Int) contract [returns() implies (x > 0)] = x",
        "fun <T> f<U>()", "class C { constructor() : Wrong() {} }", "class C { constructor() : Wrong() }",
        "val (a, b) = pair", "class C { companion { val x = 1 } }", "enum E { A, B }",
        "val x = object { val x = 1 }", "val f = context(logger: Logger) fun() {}",
        "class C<T : Any> where T : I { init { val x = 1 } }"
    )
    val scripts = listOf("", "// hi\n", "#!/bin/kotlin\nprintln(42)", "package p\nimport a.b\nval x = 1\nprintln(x)", "}") + bodies
}
