package li.songe.kotlin.format.upstream.kdoc

internal fun Char.isJavaIdentifierPart(): Boolean = isLetterOrDigit() || category in setOf(
    CharCategory.CURRENCY_SYMBOL, CharCategory.CONNECTOR_PUNCTUATION, CharCategory.LETTER_NUMBER,
    CharCategory.NON_SPACING_MARK, CharCategory.COMBINING_SPACING_MARK, CharCategory.FORMAT,
) || code in 0..8 || code in 14..27 || code in 127..159

interface CommentRewriter { fun rewrite(tok: Tok, maxWidth: Int, column0: Int): String }
data class Tok(val originalText: String) {
    val isSlashSlashComment get() = originalText.startsWith("//")
    val isJavadocComment get() = originalText.startsWith("/**") && originalText.length > 4
    val isComment get() = isSlashSlashComment || originalText.startsWith("/*") || originalText.startsWith("#!")
}
internal class Pattern private constructor(private val regex: Regex) {
    fun matcher(input: String) = Matcher(regex, input)
    class Matcher(regex: Regex, input: String) {
        private val results = regex.findAll(input).iterator()
        private var current: MatchResult? = null
        fun find(): Boolean { if (!results.hasNext()) return false; current = results.next(); return true }
        fun group(index: Int): String = current!!.groupValues[index]
    }
    companion object { fun compile(pattern: String) = Pattern(Regex(pattern)) }
}
internal object Strings { fun repeat(text: String, count: Int) = text.repeat(count) }
internal class CharMatcher(private val inverse: Boolean = false) {
    fun matches(c: Char): Boolean = (c in "\t\n\u000b\u000c\r \u0085\u00a0\u1680\u2028\u2029\u202f\u205f\u3000" || c in '\u2000'..'\u200a') != inverse
    fun trimTrailingFrom(text: String): String = text.trimEnd(::matches)
    fun indexIn(text: String) = text.indexOfFirst(::matches)
    fun negate() = CharMatcher(!inverse)
    companion object { fun whitespace() = CharMatcher() }
}
internal object Newlines {
    fun lineIterator(text: String): Iterator<String> {
        val lines = mutableListOf<String>(); var start = 0
        for (match in Regex("\r\n|\r|\n").findAll(text)) { lines.add(text.substring(start, match.range.last + 1)); start = match.range.last + 1 }
        if (start < text.length) lines.add(text.substring(start))
        return lines.iterator()
    }
}
internal fun String.Companion.format(pattern: String, value: String): String {
    val width = pattern.removePrefix("%").removeSuffix("s").toInt()
    return if (width < 0) value.padEnd(-width) else value.padStart(width)
}
