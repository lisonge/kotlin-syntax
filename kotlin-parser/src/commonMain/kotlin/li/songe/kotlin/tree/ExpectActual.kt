package li.songe.kotlin.tree

/** Syntactic signatures for on-demand expect/actual navigation, not compiler compatibility checks. */
internal fun SyntaxNode.expectActualJson(source: String, role: String, keyword: SyntaxNode?, typeParameters: List<String>): String {
    fun tokens(node: SyntaxNode): List<String> {
        if (node.kind in setOf("WHITE_SPACE", "EOL_COMMENT", "BLOCK_COMMENT", "DOC_COMMENT", "ANNOTATION_ENTRY")) return emptyList()
        if (node.children.isNotEmpty()) return node.children.flatMap(::tokens)
        if (node.end == node.start) return emptyList()
        val text = source.substring(node.start, node.end).removeSurrounding("`")
        val parameter = typeParameters.indexOfLast { it == text }
        return listOf(if (node.kind == "IDENTIFIER" && parameter >= 0) "#T$parameter" else text)
    }
    fun strings(values: List<String>) = values.joinToString(prefix = "[", postfix = "]") { jsonString(it) }
    val receiver = children.takeWhile { it.kind != "IDENTIFIER" }.firstOrNull { it.kind == "TYPE_REFERENCE" }
        .takeIf { children.any { it.kind == "DOT" } }
    val parameters = children.firstOrNull { it.kind == "VALUE_PARAMETER_LIST" }?.children.orEmpty()
        .filter { it.kind == "VALUE_PARAMETER" }.map { p ->
            val type = p.children.firstOrNull { it.kind == "TYPE_REFERENCE" }?.let(::tokens).orEmpty()
            val vararg = p.children.firstOrNull { it.kind == "MODIFIER_LIST" }?.children?.any { it.kind == "VARARG_KEYWORD" } == true
            strings((if (vararg) listOf("vararg") else emptyList()) + type)
        }
    val modifiers = children.firstOrNull { it.kind == "MODIFIER_LIST" }?.children.orEmpty()
    val contexts = modifiers.filter { it.kind == "CONTEXT_PARAMETER_LIST" }.flatMap { it.children }
        .filter { it.kind == "VALUE_PARAMETER" || it.kind == "CONTEXT_RECEIVER" }
        .map { parameter -> strings(parameter.children.firstOrNull { it.kind == "TYPE_REFERENCE" }?.let(::tokens).orEmpty()) }
    val classifier = when {
        kind == "TYPEALIAS" -> "alias"
        kind == "OBJECT_DECLARATION" -> "object"
        kind != "CLASS" -> ""
        modifiers.any { it.kind == "ENUM_KEYWORD" } -> "enum"
        modifiers.any { it.kind == "ANNOTATION_KEYWORD" } -> "annotation"
        children.any { it.kind == "INTERFACE_KEYWORD" } -> "interface"
        else -> "class"
    }
    val ownParameters = children.firstOrNull { it.kind == "TYPE_PARAMETER_LIST" }?.children.orEmpty().count { it.kind == "TYPE_PARAMETER" }
    return """{"role":${jsonString(role)},"keyword":${keyword?.let { "[${it.start},${it.end}]" } ?: "null"},"classifier":${jsonString(classifier)},"typeParameters":$ownParameters,"receiver":${strings(receiver?.let(::tokens).orEmpty())},"parameters":[${parameters.joinToString()}],"contexts":[${contexts.joinToString()}],"suspend":${modifiers.any { it.kind == "SUSPEND_KEYWORD" }}}"""
}
