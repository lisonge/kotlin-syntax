package li.songe.kotlin.tree

/** Syntax-supported receiver paths. This deliberately does not infer generic or lambda receiver types. */
internal fun SyntaxNode.navigationPath(): List<SyntaxNode>? = when (kind) {
    "REFERENCE_EXPRESSION" -> children.firstOrNull { it.kind == "IDENTIFIER" }?.let { listOf(it) }
    "CALL_EXPRESSION" -> children.firstOrNull { it.kind == "REFERENCE_EXPRESSION" }?.navigationPath()
    "USER_TYPE" -> {
        val prefix = children.firstOrNull { it.kind == "USER_TYPE" }?.navigationPath() ?: emptyList()
        children.firstOrNull { it.kind == "REFERENCE_EXPRESSION" }?.navigationPath()?.let { prefix + it }
    }
    "TYPE_REFERENCE", "NULLABLE_TYPE" -> children.firstOrNull { it.kind == "USER_TYPE" || it.kind == "NULLABLE_TYPE" }?.navigationPath()
    "DOT_QUALIFIED_EXPRESSION", "SAFE_ACCESS_EXPRESSION", "CALLABLE_REFERENCE_EXPRESSION" -> {
        val parts = children.filter { it.children.isNotEmpty() }
        if (parts.size != 2) null else {
            val left = parts[0].navigationPath()
            val right = parts[1].navigationPath()
            if (left == null || right == null) null else left + right
        }
    }
    "THIS_EXPRESSION" -> listOf(this)
    else -> null
}

internal fun SyntaxNode.declaredTypePath(): List<SyntaxNode>? = children.firstOrNull { it.kind == "TYPE_REFERENCE" }?.navigationPath()
internal fun SyntaxNode.constructorPath(): List<SyntaxNode>? {
    val initializer = children.dropWhile { it.kind != "EQ" }.drop(1).firstOrNull { it.children.isNotEmpty() } ?: return null
    return if (initializer.kind == "CALL_EXPRESSION") initializer.children.firstOrNull { it.kind == "REFERENCE_EXPRESSION" }?.navigationPath() else null
}

fun SyntaxNode.navigationQueryJson(source: String, offset: Int, index: DefinitionIndex, parameter: String? = null): String {
    val ancestors = mutableListOf<SyntaxNode>()
    fun locate(node: SyntaxNode): Boolean {
        if (offset < node.start || offset >= node.end) return false
        ancestors.add(node)
        node.children.firstOrNull { locate(it) }
        return true
    }
    locate(this)
    val identifier = ancestors.lastOrNull()?.takeIf { it.kind == "IDENTIFIER" } ?: return "null"
    if (ancestors.any { it.kind in setOf("IMPORT_DIRECTIVE", "PACKAGE_DIRECTIVE") }) return "null"
    if (ancestors.any { it.kind == "VALUE_ARGUMENT_NAME" }) {
        val call = ancestors.lastOrNull { it.kind == "CALL_EXPRESSION" } ?: return "null"
        val callee = call.navigationPath()?.lastOrNull() ?: return "null"
        return navigationQueryJson(source, callee.start, index, source.substring(identifier.start, identifier.end).removeSurrounding("`"))
    }
    val expression = ancestors.asReversed().firstOrNull { node ->
        node.kind in setOf("DOT_QUALIFIED_EXPRESSION", "SAFE_ACCESS_EXPRESSION", "CALLABLE_REFERENCE_EXPRESSION", "USER_TYPE") && node.navigationPath()?.any { it.start == identifier.start } == true
    } ?: ancestors.lastOrNull { parameter != null && it.kind == "REFERENCE_EXPRESSION" } ?: return "null"
    // Choose the outermost path which still contains the selected segment, without entering call arguments.
    val qualified = ancestors.firstOrNull { it.navigationPath()?.any { token -> token.start == identifier.start } == true && it.kind in setOf("DOT_QUALIFIED_EXPRESSION", "SAFE_ACCESS_EXPRESSION", "CALLABLE_REFERENCE_EXPRESSION", "USER_TYPE") } ?: expression
    fun hasReceiverCall(node: SyntaxNode): Boolean =
        (node.kind == "CALL_EXPRESSION" && node.end <= identifier.start) || node.children.any(::hasReceiverCall)
    if (hasReceiverCall(qualified)) return "null"
    val all = qualified.navigationPath() ?: return "null"
    val selected = all.indexOfFirst { it.start == identifier.start }
    if (selected < 0 || (selected == 0 && parameter == null)) return "null"
    fun text(node: SyntaxNode) = source.substring(node.start, node.end).removeSurrounding("`")
    fun strings(nodes: List<SyntaxNode>) = nodes.joinToString(prefix = "[", postfix = "]") { jsonString(text(it)) }
    fun find(node: SyntaxNode, start: Int, end: Int): SyntaxNode? {
        if (node.start == start && node.end == end && node.kind in setOf("CLASS", "OBJECT_DECLARATION", "TYPEALIAS", "PROPERTY", "VALUE_PARAMETER", "FUN")) return node
        return node.children.firstNotNullOfOrNull { if (it.start <= start && end <= it.end) find(it, start, end) else null }
    }
    val visited = mutableSetOf<Int>()
    fun typedRoot(path: List<SyntaxNode>, mode: String): String {
        val target = index.definitionsAt(path.first().start).singleOrNull()
        val declaration = target?.let { find(this, it.start, it.end) }
        if (declaration?.kind in setOf("CLASS", "OBJECT_DECLARATION", "TYPEALIAS")) {
            return """{"path":[],"mode":${jsonString(mode)},"bindingStart":${target!!.nameStart},"typeMembers":${strings(path.drop(1))}}"""
        }
        return """{"path":${strings(path)},"mode":${jsonString(mode)}}"""
    }
    fun root(token: SyntaxNode): String? {
        if (!visited.add(token.start)) return null
        val targets = index.navigationDefinitionsAt(token.start)
        if (targets.size > 1) return null
        if (targets.isEmpty()) {
            val external = index.externalReferenceAt(token.start) ?: return null
            return """{"path":${strings(listOf(token))},"mode":"symbol","typeOnly":${external.type && ancestors.none { it.kind == "TYPE_REFERENCE" }}}"""
        }
        val target = targets.single()
        val declaration = find(this, target.start, target.end)
        if (declaration == null) {
            // An explicit import is expanded by the workspace query planner.
            if (source.substring(target.start, target.end).trimStart().startsWith("import")) return """{"path":${strings(listOf(token))},"mode":"symbol"}"""
            return null
        }
        if (declaration.kind in setOf("CLASS", "OBJECT_DECLARATION", "TYPEALIAS") || (parameter != null && declaration.kind == "FUN")) return """{"path":[],"mode":"symbol","bindingStart":${target.nameStart}}"""
        declaration.declaredTypePath()?.let { return typedRoot(it, "instance") }
        declaration.constructorPath()?.let {
            val bindings = index.definitionsAt(it.first().start)
            if (bindings.any { binding ->
                val bound = find(this, binding.start, binding.end)
                bound != null && bound.kind !in setOf("CLASS", "TYPEALIAS")
            }) return null
            return typedRoot(it, "constructor")
        }
        val initializer = declaration.children.dropWhile { it.kind != "EQ" }.drop(1).firstOrNull { it.children.isNotEmpty() }
        val alias = initializer?.takeIf { it.kind == "REFERENCE_EXPRESSION" }?.navigationPath()?.singleOrNull()
        return alias?.let { root(it) }
    }
    val first = all.first()
    val receiver = if (first.kind == "THIS_EXPRESSION") {
        val ownerIndex = ancestors.indexOfLast { it.kind == "CLASS" || it.kind == "OBJECT_DECLARATION" }
        if (ownerIndex < 0 || ancestors.drop(ownerIndex + 1).any { it.kind == "FUNCTION_LITERAL" || (it.kind == "FUN" && it.children.any { child -> child.kind == "DOT" }) }) return "null"
        val owner = ancestors[ownerIndex].children.firstOrNull { it.kind == "IDENTIFIER" } ?: return "null"
        """{"path":[],"mode":"instance","bindingStart":${owner.start}}"""
    } else root(first) ?: return "null"
    return """{"root":$receiver,"members":${strings(all.take(selected + 1).drop(1))},"type":${ancestors.any { it.kind == "TYPE_REFERENCE" }},"parameter":${parameter?.let(::jsonString) ?: "null"},"callable":${qualified.kind == "CALLABLE_REFERENCE_EXPRESSION"},"offset":$offset}"""
}
