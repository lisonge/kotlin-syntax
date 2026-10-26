package li.songe.kotlin.builder

/** Port of Kotlin 2.4.21 SemanticWhitespaceAwarePsiBuilderImpl (Apache-2.0). */
class SemanticBuilder(val delegate: SyntaxBuilder) {
    private val newlines = mutableListOf(true)
    private val joining = mutableListOf(true)
    private val complex = setOf("SAFE_ACCESS", "ELVIS", "EXCLEXCL")

    fun disableNewlines() { newlines += false }
    fun enableNewlines() { newlines += true }
    fun restoreNewlinesState() { check(newlines.size > 1); newlines.removeAt(newlines.lastIndex) }
    fun disableJoiningComplexTokens() { joining += false }
    fun enableJoiningComplexTokens() { joining += true }
    fun restoreJoiningComplexTokensState() { check(joining.size > 1); joining.removeAt(joining.lastIndex) }

    fun newlineBeforeCurrentToken(): Boolean {
        if (!newlines.last()) return false
        if (delegate.eof()) return true
        for (i in 1..delegate.currentOffset) {
            val previous = delegate.rawLookup(-i)
            if (previous in COMMENT_KINDS) continue
            if (previous != "WHITE_SPACE") break
            val start = delegate.rawTokenTypeStart(-i)
            val end = delegate.rawTokenTypeStart(-i + 1)
            for (offset in start until end) if (delegate.source[offset] == '\n') return true
        }
        return false
    }
    private fun joined(kind: String?, steps: Int): String? = when {
        kind == "QUEST" && delegate.rawLookup(steps) == "DOT" -> "SAFE_ACCESS"
        kind == "QUEST" && delegate.rawLookup(steps) == "COLON" -> "ELVIS"
        kind == "EXCL" && delegate.rawLookup(steps) == "EXCL" -> "EXCLEXCL"
        else -> kind
    }
    val tokenType: String? get() = if (joining.last()) joined(delegate.tokenType, 1) else delegate.tokenType
    val tokenText: String? get() = if (joining.last()) when (tokenType) {
        "ELVIS" -> "?:"
        "SAFE_ACCESS" -> "?."
        // Preserve the official adapter's raw text for EXCLEXCL.
        else -> delegate.tokenText
    } else delegate.tokenText
    fun lookAhead(steps: Int): String? {
        if (!joining.last()) return delegate.lookAhead(steps)
        return if (tokenType in complex) delegate.lookAhead(steps + 1)
        else joined(delegate.lookAhead(steps), 2)
    }
    fun advanceLexer() {
        val kind = tokenType
        if (joining.last() && kind in complex) {
            val mark = delegate.mark()
            delegate.advanceLexer(); delegate.advanceLexer()
            mark.collapse(checkNotNull(kind))
        } else delegate.advanceLexer()
    }
}
