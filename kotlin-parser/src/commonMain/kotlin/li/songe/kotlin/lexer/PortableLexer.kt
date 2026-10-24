package li.songe.kotlin.lexer

/** UTF-16 offsets, including whitespace and error tokens. No symbol/type resolution. */
data class Token(val kind: String, val start: Int, val end: Int)

fun tokenize(source: String): List<Token> {
    val lexer = PortableLexer(source)
    val result = mutableListOf<Token>()
    // The official lexer can emit a zero-length DANGLING_NEWLINE before consuming it.
    while (true) {
        val kind = lexer.advance() ?: break
        result += Token(kind, lexer.zzStartRead, lexer.zzMarkedPos)
        check(result.size <= source.length * 3 + 16) { "Lexer did not make progress" }
    }
    return result
}

/** Scanner loop ported from the pinned JFlex lexer; tables/actions retain upstream semantics. */
internal class PortableLexer(private val source: String) {
    var zzStartRead = 0
    var zzMarkedPos = 0
    var zzCurrentPos = 0
    private var lexicalState = YYINITIAL
    var lBraceCount = 0
    var requiredInterpolationPrefix = 0
    var commentStart = 0
    var commentDepth = 0
    private data class State(val state: Int, val braces: Int, val prefix: Int)
    private val states = ArrayDeque<State>()

    fun yystate(): Int = lexicalState
    fun yybegin(state: Int) { lexicalState = state }
    fun yylength(): Int = zzMarkedPos - zzStartRead
    fun yycharat(index: Int): Char = source[zzStartRead + index]
    fun getTokenStart(): Int = zzStartRead
    fun yypushback(count: Int) { require(count in 0..yylength()); zzMarkedPos -= count }
    fun pushState(state: Int) {
        states.addLast(State(lexicalState, lBraceCount, requiredInterpolationPrefix))
        lBraceCount = 0; requiredInterpolationPrefix = -1; lexicalState = state
    }
    fun pushInterpolationPrefix(prefix: Int) {
        pushState(STRING_PREFIX); requiredInterpolationPrefix = prefix
    }
    fun popState() {
        val old = states.removeLast()
        lexicalState = old.state; lBraceCount = old.braces; requiredInterpolationPrefix = old.prefix
    }
    fun commentStateToTokenType(state: Int): String = when (state) {
        BLOCK_COMMENT -> "BLOCK_COMMENT"
        DOC_COMMENT -> "DOC_COMMENT"
        else -> error("Unexpected comment state: $state")
    }

    fun advance(): String? {
        while (true) {
            zzStartRead = zzMarkedPos
            zzCurrentPos = zzStartRead
            var cursor = zzStartRead
            var state = LEX_STATES[lexicalState]
            var action = if ((LexerTables.ATTRIBUTE[state] and 1) != 0) state else -1
            var accepted = zzMarkedPos
            while (true) {
                if (cursor >= source.length) {
                    // JFlex stores this cursor when attempting to refill at EOF.
                    // Actions (notably the shebang rule) observe zzCurrentPos.
                    zzCurrentPos = cursor
                    break
                }
                val first = source[cursor].code
                val second = if (cursor + 1 < source.length) source[cursor + 1].code else -1
                val pair = first in 0xD800..0xDBFF && second in 0xDC00..0xDFFF
                val cp = if (pair) 0x10000 + ((first - 0xD800) shl 10) + second - 0xDC00 else first
                cursor += if (pair) 2 else 1
                val low = cp and 255
                val charClass = LexerTables.CMAP_BLOCKS[if (low == cp) low else LexerTables.CMAP_TOP[cp shr 8] or low]
                val next = LexerTables.TRANS[LexerTables.ROWMAP[state] + charClass]
                if (next == -1) break
                state = next
                val attributes = LexerTables.ATTRIBUTE[state]
                if ((attributes and 1) != 0) {
                    action = state; accepted = cursor
                    if ((attributes and 8) != 0) break
                }
            }
            zzMarkedPos = accepted
            if (zzStartRead == source.length) {
                if (lexicalState == BLOCK_COMMENT || lexicalState == DOC_COMMENT) {
                    val kind = commentStateToTokenType(lexicalState)
                    popState(); zzStartRead = commentStart
                    return kind
                }
                return null
            }
            val token = runAction(if (action < 0) action else LexerTables.ACTION[action])
            if (token != null) return token
        }
    }
}
