package li.songe.kotlin.parsing

object ExpressionCases {
    val sources = listOf(
        "class C : I by factory({ it }) {}", "class C : I by (factory { it }) {}", "class C : I by factories[factory { it }] {}",
        "val x: (Mutable)List<String>!", "val x: Array<(out) String>!", "val x: package.foo.Bar", "val x: foo.(Mutable)List<String>",
        "val x = level < min || level > max || level < 0",
        "@A(String::class) class C", "@A(kotlin.String::class, IntArray::class) class C",
        "@A(classes = [String::class, Int::class]) class C", "@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION) class C",
        "@A(value = [], flags = [true, false,], text = [\"a\", \"b\"]) class C", "@A(Nested(1), -2, 1 + 2 * 3) class C",
        "@A(String?::class) class C", "val x = ::class", "val x = String::length", "val x = ::f",
        "val x = Foo<Bar>::class", "val x = [1, [2, 3]]", "val x = a[0, 1]", "val x = a[]",
        "val x = foo(1, name = \"a\", *xs)", "val x = obj.method(1).field", "val x = obj?.method()!!",
        "val x = a + b * c - d / e", "val x = a ?: b ?: c", "val x = !a || b && c",
        "val x = a is String", "val x = a as? String", "val x = a in b", "val x = a until b",
        "val x = 1 < 2", "val x = a <= b && b >= c", "val x = a == b || a !== c", "val x = ++a + b--",
        "val x = a = b = c", "val x = a..b", "val x = a..<b", "val x = a +", "val x = foo(",
        "val x = a +\nb", "val x = a\n?: b", "val x = this@Outer", "val x = super<Base>@Outer",
        "val f: context(Logger) () -> Unit", "val f: context(Logger, Config) String.(Int) -> Boolean",
        "val f: context(logger: Logger) (Int) -> Unit", "val f: context() () -> Unit", "val f: context(Logger) Int",
        "context(logger: Logger) fun f()", "context(Logger) fun f()", "context(@A logger: Logger, config: Config) val x: Int",
        "typealias F = context(Logger) suspend (Int) -> Unit", "val f: suspend context(Logger) (Int) -> Unit",
        "val x: T & Any", "fun <T> f(x: T & Any): T & Any", "@A(a = [1,, 2]) class C"
    )
}
