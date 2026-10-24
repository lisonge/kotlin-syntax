package li.songe.kotlin.lexer

import kotlin.test.Test
import kotlin.test.assertEquals

class LexerTest {
    @Test fun simpleDeclaration() {
        assertEquals(listOf(
            Token("VAL_KEYWORD", 0, 3), Token("WHITE_SPACE", 3, 4),
            Token("IDENTIFIER", 4, 5), Token("WHITE_SPACE", 5, 6),
            Token("EQ", 6, 7), Token("WHITE_SPACE", 7, 8), Token("INTEGER_LITERAL", 8, 10)
        ), tokenize("val x = 42"))
    }
    @Test fun nestedCommentAndUnicode() {
        val source = "/* outer /* inner */ end */ val 名字 = \"😀\""
        val tokens = tokenize(source)
        assertEquals("BLOCK_COMMENT", tokens.first().kind)
        assertEquals(source.length, tokens.last().end)
        assertEquals(source, tokens.joinToString("") { source.substring(it.start, it.end) })
    }
    @Test fun unfinishedStringMakesProgress() {
        val tokens = tokenize("\"unfinished\nval x = 1")
        assertEquals(1, tokens.count { it.kind == "DANGLING_NEWLINE" })
        assertEquals("INTEGER_LITERAL", tokens.last().kind)
    }
}
