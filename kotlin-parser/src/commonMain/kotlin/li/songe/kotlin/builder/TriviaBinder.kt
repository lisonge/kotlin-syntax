package li.songe.kotlin.builder

import li.songe.kotlin.lexer.Token

internal val COMMENT_KINDS = setOf("EOL_COMMENT", "BLOCK_COMMENT", "DOC_COMMENT", "SHEBANG_COMMENT")
internal fun isTrivia(kind: String): Boolean = kind == "WHITE_SPACE" || kind in COMMENT_KINDS

/** Kotlin 2.4.21 comment binding policies, independent of IntelliJ token classes. */
enum class TriviaBinder {
    LEFT_EDGE, RIGHT_EDGE, PRECEDING_COMMENTS, PRECEDING_DOC, TRAILING_COMMENTS,
    PRECEDING_ALL_COMMENTS, TRAILING_ALL_COMMENTS, FIRST_SHEBANG;

    internal fun edge(tokens: List<Token>, source: String): Int {
        fun lineBreaks(i: Int): Int {
            val token = tokens[i]
            var count = 0
            for (j in token.start until token.end) if (source[j] == '\n' || source[j] == '\r' && (j + 1 == token.end || source[j + 1] != '\n')) count++
            return count
        }
        when (this) {
            LEFT_EDGE -> return 0
            RIGHT_EDGE -> return tokens.size
            FIRST_SHEBANG -> return if (tokens.firstOrNull()?.kind == "SHEBANG_COMMENT") {
                if (tokens.getOrNull(1)?.kind == "WHITE_SPACE") 2 else 1
            } else 0
            PRECEDING_ALL_COMMENTS -> return if (tokens.firstOrNull()?.kind == "WHITE_SPACE") 1 else 0
            TRAILING_ALL_COMMENTS -> return tokens.size - if (tokens.lastOrNull()?.kind == "WHITE_SPACE") 1 else 0
            PRECEDING_DOC, PRECEDING_COMMENTS -> {
                for (i in tokens.indices.reversed()) if (tokens[i].kind == "DOC_COMMENT") return i
                if (this == PRECEDING_DOC) return tokens.size
                var result = tokens.size
                for (i in tokens.indices.reversed()) {
                    when {
                        tokens[i].kind == "WHITE_SPACE" -> if (lineBreaks(i) > 1) break
                        tokens[i].kind in COMMENT_KINDS -> if (i == 0 || tokens[i - 1].kind == "WHITE_SPACE" && lineBreaks(i - 1) > 0) result = i
                        else -> break
                    }
                }
                return result
            }
            TRAILING_COMMENTS -> {
                var result = 0
                for (i in tokens.indices) {
                    when (tokens[i].kind) {
                        "WHITE_SPACE" -> if (lineBreaks(i) > 0) break
                        "EOL_COMMENT", "BLOCK_COMMENT" -> result = i + 1
                        else -> break
                    }
                }
                return result
            }
        }
    }
}
