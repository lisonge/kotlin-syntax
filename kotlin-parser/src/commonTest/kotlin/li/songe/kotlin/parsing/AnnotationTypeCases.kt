package li.songe.kotlin.parsing

object AnnotationTypeCases {
    val curated = listOf(
        "@A class C", "@A(1) public class C", "@a.b.A(name = \"x\") fun f()", "@[A B] class C",
        "@file:JvmName(\"Example\")\npackage sample\nclass C", "@file:Suppress(\"x\")\nclass C",
        "#!/bin/kotlin\n@file:[A B]\npackage a\nimport b.c", "@A package a", "@field:A val x: Int",
        "class C(@param:A val x: @B String)", "class C { @get:A val x: Int get() = 1 }",
        "fun <@A T> f(@B x: T): @C T = x", "typealias F = @A String", "val xs: List<@A String>",
        "@", "@:A class C", "@bad:A class C", "@file:", "@[] class C", "@[A, B] class C", "@ A class C",
        "fun String.f()", "fun String?.f(): Int = 1", "val String.size: Int get() = 1",
        "fun <T> List<T>.first(): T", "val <T> List<T>.first: T", "fun a.b.C.f()",
        "fun @A String.f()", "fun @receiver:A String.f()", "fun @A f()", "fun (String).f()",
        "fun ((Int) -> String).f()", "fun ((Int) -> String)?.f()", "val (String).x: Int",
        "val f: () -> Unit", "val f: (Int) -> String", "val f: (x: Int, y: String) -> Boolean",
        "val f: ((Int) -> String)?", "val f: suspend (Int) -> String", "val f: String.(Int) -> Boolean",
        "val f: String?.(Int) -> Boolean", "val f: (Int) -> (String) -> Unit", "typealias F = List<(Int) -> Unit>",
        "val f: (Int)", "val f: ((Int)?)", "val f: @A (Int) -> Unit", "val f: @A() (Int) -> Unit",
        "val f: (@A Int, @B String) -> @C Unit", "val f: (vararg xs: Int) -> Unit",
        "fun f(callback: (Int) -> String): () -> Unit", "val f: (", "val f: () ->", "val f: (Int, String)",
        "val f: (x: Int,) -> Unit", "val f: (Int, ) -> Unit",
        "fun <T> @A List<@B T>?.f(@C action: @D (T) -> Unit): @E Unit",
        "val <T> List<T>.first: T where @A T : Any", "fun (@A String)?.f()",
        "val f: @A (x: Int) -> Unit", "val f: @A() () -> Unit", "val f: (@A() () -> Unit)?",
        "val f: (noinline () -> Unit) -> Unit", "val f: (vararg Int) -> Unit",
        "@file:[A(1) B(\"x\")]\n@C class D", "@A\n@B class C",
        "fun List<() -> Unit>.f()", "fun (String.(Int) -> Unit).f()", "val String?.x: (() -> Unit)?",
        "@file:A\n@B\npackage p", "@get:[A B] val x: Int", "@all:A val x: Int",
        "val f: (x: @A Int, y: @B String) -> @C Unit", "val f: @A /* c */ (Int) -> Unit",
        "fun String /* receiver */ . /* name */ f()", "val String\n.x: Int", "fun `class`.`fun`()",
        "@receiver:[A B] fun String.f()", "val f: @A @B (Int) -> Unit", "val f: suspend @A String.(Int) -> Unit",
        "@A() class C @B constructor(@C x: Int)", "@file:A\n// docs\n@B\nclass C",
        "val f: (out Int) -> Unit", "val f: (x: y: Int) -> Unit", "val f: (Int,, String) -> Unit",
        "@file:[@A B,]\nclass C", "val f: (@A String).(Int) -> Unit", "fun @A String?.`f`()",
        "val f: (@A() (Int) -> Unit)?", "val f: (Int) -> ((String) -> Unit)?"
    )
    val sources = curated + listOf(
        "@file:JvmName(\"Example\")\npackage demo\n@A class C",
        "fun @receiver:A List<String>?.f(@B x: (Int) -> Unit): String",
        "val f: @A (x: Int, y: String) -> Unit"
    ).flatMap { text -> (0..text.length).map { text.take(it) } } +
        listOf("Int", "@A Int", "Int?", "List<String>", "(Int)", "() -> Unit", "String.(Int) -> Unit").flatMap { type ->
            listOf("val f: ($type) -> Unit", "val f: (x: $type) -> Unit", "val f: (($type) -> Unit)?", "fun ($type).f()")
        }
}
