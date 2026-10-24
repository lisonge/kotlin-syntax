package li.songe.kotlin.parsing

object ParserCases {
    val curated = listOf(
        "", " ", "// header\n", "#!/bin/kotlin\n", "/* unterminated",
        "package a.b.c", "package `when`.data;", "package", "package .a", "package a..b", "package a.\nb", "package 1", "package a; garbage",
        "import a.b", "import a.*", "import a.b as c;", "import a.* as c", "import", "import 123;", "import a.\nb", "import a as", "import a..b", "import a.b // tail\n",
        "package a\nimport b.c\nimport d.*\n",
        "class A", "interface I", "object O", "class A {}", "class A { class B; interface I; object O {} }",
        "public data class A(val x: Int, var y: String?)", "class Box<out T : Any>(val item: T)", "class C private constructor() {}",
        "class", "class A(", "class A {", "class A { fun }", "class A { init {} }", "class A { companion object {} }",
        "typealias Name = String", "typealias Box<T> = List<T>", "typealias Nested = a.b.Map<String, List<Int?>>;", "typealias Star = List<*>", "typealias", "typealias A =",
        "fun foo()", "fun foo() {}", "fun foo(x: Int, y: String?): Boolean", "fun <T> id(x: T): T = x", "fun foo(x: Int = 1,): Int = 2;", "fun", "fun f(", "fun f(x:)", "fun f() =",
        "val x: Int", "var y: String?", "val answer = 42", "val enabled = true", "val missing = null", "val c = 'x'", "val f = 1.5", "val", "val x =", "val x:",
        "/** Doc */\nclass A {\n // first\n val x: Int\n fun f() {} // last\n}\n",
        "val x = 1\nimport a.b\nclass A", "public class A\nprivate fun f()\ninternal val x: List<out String?>",
        "fun interface Action { fun run() }", "class C : Base(), I", "object O : I by delegate",
        "class C<T> where T : Any, T : I {}", "fun <T> f(x: T): T where T : Any = x", "typealias A<T> where T : Any = T",
        "enum class E { A, B, C; fun f() {} }", "enum class E(val x: Int) { A(1), B(x = 2) }", "enum class E {}",
        "class C { constructor() {} }", "class C() { constructor(x: Int) : this() {} }",
        "class C { constructor(x: Int) : super(x) {} }", "val s = \"hello\\nworld\"", "val s = \"hello ${'$'}name\"",
        "val s = \"value: ${'$'}{42}\"", "fun f(): Int { return 42 }", "fun f() { return; }",
        "val x: Int get() = 1", "var x: Int = 0\n private set", "var x: Int get() = 1\n set(value) {}",
        "val x by delegate", "val x: Int field = 1", "val x: Int get", "var x: Int set(",
        "public", "fun interface", "class A private", "class A { constructor(x: Int) }",
        "val café = \"😀\"", "val s = \"unterminated", "val s = \"broken\n", "class A\r\nclass B", "package \uD800"
    )
    val sources = (curated + AnnotationTypeCases.sources + ExpressionCases.sources + ControlCases.files + (ExpressionCases.sources + ControlCases.files).flatMap { source -> (0..source.length).map { source.take(it) } } + listOf(
        "package sample.demo\nimport a.b as c\nclass Box<T>(val x: T)",
        "fun foo(x: Int, y: String?): Boolean", "typealias Names = List<String?>", "val answer: Int = 42"
    ).flatMap { source -> (0..source.length).map { source.take(it) } }).distinct()
}
