package li.songe.kotlin.tree

fun jsonString(value: String): String = buildString {
    append('"')
    for (c in value) when (c) {
        '"' -> append("\\\"")
        '\\' -> append("\\\\")
        '\n' -> append("\\n")
        '\r' -> append("\\r")
        '\t' -> append("\\t")
        else -> if (c.code < 32 || c.isSurrogate()) append("\\u" + c.code.toString(16).padStart(4, '0')) else append(c)
    }
    append('"')
}

fun SyntaxNode.toJson(): String = "{\"kind\":${jsonString(kind)},\"start\":$start,\"end\":$end," +
    "\"children\":${children.joinToString(prefix = "[", postfix = "]") { it.toJson() }},\"error\":${error?.let(::jsonString) ?: "null"}}"
