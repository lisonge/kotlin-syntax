package li.songe.kotlin.format

import kotlin.test.Test
import kotlin.test.assertEquals
import org.jetbrains.kotlinx.ktfmt.format.Formatter
import org.jetbrains.kotlinx.ktfmt.format.KotlinCode
import org.jetbrains.kotlinx.ktfmt.format.FileType
import li.songe.kotlin.tree.jsonString

class FormatterDifferentialTest {
    @Test fun referenceCompilerMatchesProjectKotlin() {
        val version = System.getProperty("kotlin.syntax.version")
        assertEquals(version, org.jetbrains.kotlin.config.KotlinCompilerVersion.VERSION)
        assertEquals(version, KotlinVersion.CURRENT.toString())
    }
    @Test fun upstreamCorpus() {
        val root = java.io.File(System.getProperty("ktfmt.cases"))
        val inputs = root.walkTopDown().filter { it.extension == "input" }.sortedBy { it.path }.toList()
        assertEquals(System.getProperty("ktfmt.cases.count").toInt(), inputs.size, "Incomplete upstream input corpus")
        val report = java.io.File("build/oracle").apply { mkdirs() }
        val failures = mutableListOf<String>()
        val fixtures = mutableListOf<String>()
        var count = 0
        for (file in inputs) {
          for (style in FormatStyle.entries) {
            val name = style.name + "/" + file.relativeTo(root).invariantSeparatorsPath
            val source = file.readText().replace("\r\n", "\n")
            val base = when (style) {
                FormatStyle.GOOGLE -> Formatter.GOOGLE_FORMAT
                FormatStyle.KOTLINLANG -> Formatter.KOTLINLANG_FORMAT
                FormatStyle.META -> Formatter.META_FORMAT
            }
            val config = org.jetbrains.kotlinx.ktfmt.testutil.CaseConfig.parse(source).configure(base)
            val o = config.options
            val options = FormattingOptions(maxWidth = o.maxWidth, blockIndent = o.blockIndent, continuationIndent = o.continuationIndent,
                trailingCommaManagementStrategy = TrailingCommaManagementStrategy.valueOf(o.trailingCommaManagementStrategy.name),
                removeUnusedImports = o.removeUnusedImports, preserveLambdaBreaks = o.preserveLambdaBreaks)
            val expected = Formatter.format(o, KotlinCode(source, config.fileType))
            val second = Formatter.format(o, KotlinCode(expected, config.fileType))
            fixtures += """{"name":${jsonString(name)},"source":${jsonString(source)},"expected":${jsonString(expected)},"second":${jsonString(second)},"script":${config.fileType == FileType.SCRIPT},"maxWidth":${o.maxWidth},"blockIndent":${o.blockIndent},"continuationIndent":${o.continuationIndent},"trailingCommas":${jsonString(o.trailingCommaManagementStrategy.name)},"removeUnusedImports":${o.removeUnusedImports},"preserveLambdaBreaks":${o.preserveLambdaBreaks}}"""
            count++
            try {
                val actual = format(source, options, config.fileType == FileType.SCRIPT)
                if (actual != expected) {
                    val stem = name.replace('/', '_')
                    java.io.File(report, "$stem.expected").writeText(expected)
                    java.io.File(report, "$stem.actual").writeText(actual)
                    failures += "$name: output differs"
                } else if (format(actual, options, config.fileType == FileType.SCRIPT) != second) failures += "$name: second pass differs"
            } catch(t: Throwable) { failures += "$name: ${t.message?.lineSequence()?.firstOrNull()}" }
          }
        }
        java.io.File(report, "failures.txt").writeText(failures.joinToString("\n"))
        java.io.File(report, "formatter.json").writeText(fixtures.joinToString(prefix = "[", postfix = "]"))
        assertEquals(0, failures.size, "${failures.size}/$count official cases differ; see build/oracle/failures.txt")
    }
    @Test fun basicSyntax() {
        val cases = listOf(
            "fun main(){println(\"hello\")}",
            "val x=1\nval y = x+2",
            "class A(val x:Int){fun f(a:Int,b:String):Int{return x+a}}",
            "fun f(a: Boolean) { if(a){foo()}else{bar()} }",
            "fun f() = listOf(1,2,3).map { it+1 }",
            "fun f() { for (x in 0..10) { println(x) } }",
            "typealias Foo = Map<String,List<Int>>",
            "enum class E { A,B,C }",
            "// hello\nfun f() { /* note */ println(1) }",
            "fun f(){println(\"😀\")}\r\n",
            "// only comment", "/** Documentation only. */", "", "  \r\n\t", " ", "\t", "\n\n", "\r",
            "val `名`=\"😀\"\r\nval n=1\r\n",
            "fun f(){\tfoo( /* 名 = */ 1)\t}",
            "import a.Foo\n/** [Foo.member] and [label][Foo] */\nfun f(){}",
            "import a.Foo\nimport a.label\n/** [label][Foo] */\nfun f(){}",
            "import a.Foo\n/** `[Foo]` */\nfun f(){}",
            "import a.Foo\n/**\n * ```\n * [Foo]\n * ```\n */\nfun f(){}",
            "fun f() = foo(/* €name= */1, /* é= */2, /* 𝒜= */3)",
        )
        val failures = mutableListOf<String>()
        for (source in cases) for (style in FormatStyle.entries) {
            val officialOptions = when(style) {
                FormatStyle.META -> Formatter.META_FORMAT
                FormatStyle.GOOGLE -> Formatter.GOOGLE_FORMAT
                FormatStyle.KOTLINLANG -> Formatter.KOTLINLANG_FORMAT
            }
            val expected = Formatter.format(officialOptions, KotlinCode(source, FileType.REGULAR))
            try {
                val actual = format(source, formattingOptions(style))
                if (actual != expected) failures += "$style input: $source\nexpected: <$expected>\nactual: <$actual>"
            } catch (t: Throwable) { failures += "$style input: $source\n${t.message}" }
        }
        assertEquals(emptyList(), failures)
    }
}
