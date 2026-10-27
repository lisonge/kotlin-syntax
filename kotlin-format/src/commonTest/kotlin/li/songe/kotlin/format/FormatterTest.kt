package li.songe.kotlin.format

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails

class FormatterTest {
    @Test fun unicodeAndLineEndings() {
        val source = "fun f(){println(\"😀中文\")}\r\n"
        val expected = "fun f() {\r\n    println(\"😀中文\")\r\n}\r\n"
        assertEquals(expected, format(source))
        assertEquals(expected, format(expected))
    }
    @Test fun scriptAndStyle() {
        assertEquals("println(1 + 2)\n", format("println(1+2)", script = true))
        assertEquals("fun f() {\n  foo()\n}\n", format("fun f(){foo()}", formattingOptions(FormatStyle.GOOGLE)))
    }
    @Test fun incompleteSourceIsRejected() {
        for (source in listOf("fun {", "val a =", "/* unfinished", "val x = \"unfinished")) assertFails(source) { format(source) }
        assertFails { format("val x=1", formattingOptions().copy(maxWidth = 0)) }
    }
    @Test fun importsAndComments() {
        assertEquals("/** Uses [Foo]. */\nimport a.Foo\n\nfun f(): Foo = Foo()\n",
            format("/** Uses [Foo]. */\nimport z.Unused\nimport a.Foo\nfun f():Foo=Foo()"))
    }
    @Test fun kdocLinksExcludeMarkdownTextAndCode() {
        assertEquals(setOf("Foo"), kdocReferences("/** [label][Foo] and `[Code]` */"))
        assertEquals(emptySet(), kdocReferences("/**\n * ```kotlin\n * [Code]\n * ```\n */"))
        assertEquals("import a.Foo\n\n/** [label][Foo] */\nfun f() {}\n",
            format("import a.Foo\nimport a.label\n/** [label][Foo] */\nfun f(){}"))
    }
}
