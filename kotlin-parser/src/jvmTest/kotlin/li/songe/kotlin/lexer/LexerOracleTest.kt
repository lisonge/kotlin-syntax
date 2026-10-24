package li.songe.kotlin.lexer

import java.io.File
import org.jetbrains.kotlin.lexer.KotlinLexer
import org.jetbrains.kotlin.lexer.KtTokens
import org.jetbrains.kotlin.com.intellij.psi.TokenType
import org.jetbrains.kotlin.com.intellij.psi.tree.IElementType
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals

class LexerOracleTest {
    private val officialTypes = KtTokens::class.java.fields
        .filter { IElementType::class.java.isAssignableFrom(it.type) }
        .associate { it.name to it.get(null) as IElementType } + ("BAD_CHARACTER" to TokenType.BAD_CHARACTER)

    private fun check(source: String): List<Token> {
        val expected = mutableListOf<Token>()
        val lexer = KotlinLexer()
        lexer.start(source)
        while (lexer.tokenType != null) {
            expected += Token(lexer.tokenType.toString(), lexer.tokenStart, lexer.tokenEnd)
            lexer.advance()
        }
        val actual = tokenize(source)
        assertEquals(expected, actual.map { it.copy(kind = checkNotNull(officialTypes[it.kind]) { it.kind }.toString()) }, "Source: ${escape(source)}")
        return actual
    }

    @Test fun matchesOfficialLexerAndExportsWasmFixtures() {
        val cases = mutableListOf(
            "", "val answer = 42", "package demo\r\nfun 名字(x: Int) = x + 1",
            "#!/usr/bin/env kotlin\nprintln(1)", "#!/usr/bin/env kotlin",
            "/* outer /* nested */ end */", "/* incomplete", "/** doc @param x */",
            "\"hello ${'$'}name ${'$'}{foo(\"nested\")}\"", "\"unfinished\nval x = 1",
            "\"\"\"raw ${'$'}{1 + 2}\ntext\"\"\"", "${'$'}${'$'}\"prefix ${'$'}x ${'$'}${'$'}name\"",
            "val `odd name` = 0xFFuL; val a = 1..2; val b = 1..<2",
            "'a' '\\n' '\\u1234' 'broken", "😀 𐐀 \uD800 \uDC00", "`unterminated\nnext",
            "plugins { kotlin(\"jvm\") version \"2.4.21\" }",
            "context(x: String) fun f() = x", "!in !is as? ?. ?: !! :: === !== -> =>",
            "class interface object fun val var typealias true false null this super return break continue",
            "0 00 0b101 0xCAFE 1_000 1.2e-3F .5 123u 123UL // comment\r\n"
        )
        // Every truncation exercises unfinished editor input and nested lexical states.
        val examples = cases.toList()
        for (source in examples) for (end in 0..source.length) cases += source.take(end)
        val random = Random(721)
        val fragments = listOf("val", " ", "\n", "\r", "/*", "*/", "//", "\"", "\"\"\"", "${'$'}", "{", "}", "`", "😀", "名字", "0x", "1", "'", "\\", "?", ":", "(", ")")
        repeat(500) { cases += buildString { repeat(random.nextInt(1, 30)) { append(fragments.random(random)) } } }
        val fixtures = cases.distinct().map { source ->
            val tokens = check(source)
            "{\"source\":${escape(source)},\"tokens\":[" + tokens.joinToString(",") {
                "{\"kind\":\"${it.kind}\",\"start\":${it.start},\"end\":${it.end}}"
            } + "]}"
        }
        val output = File("build/oracle/lexer.json")
        output.parentFile.mkdirs()
        output.writeText(fixtures.joinToString(",", "[", "]"))
        println("Compared ${fixtures.size} inputs with Kotlin 2.4.21; exported WASM fixtures to $output")
    }

    private fun escape(text: String): String = text.map { c ->
        if (c.code < 32 || c == '"' || c == '\\' || c.isSurrogate()) "\\u" + c.code.toString(16).padStart(4, '0') else c.toString()
    }.joinToString("", "\"", "\"")
}
