package li.songe.kotlin.tree

/** On-demand navigation over declaration identities, including function-local declarations. */
internal class LocalNavigation(private val tree: SyntaxNode, private val source: String, private val index: DefinitionIndex) {
    private val nodes = mutableMapOf<Int, SyntaxNode>()
    private val owners = mutableMapOf<Int, SyntaxNode>()
    private fun id(node: SyntaxNode) = node.children.firstOrNull { it.kind == "IDENTIFIER" }
    private fun text(node: SyntaxNode) = source.substring(node.start, node.end).removeSurrounding("`")
    private fun flag(node: SyntaxNode, flag: String) = node.children.firstOrNull { it.kind == "MODIFIER_LIST" }?.children?.any { it.kind == flag } == true
    private fun collect(node: SyntaxNode, owner: SyntaxNode?) {
        if (node.kind in declarationKinds) {
            nodes[node.start] = node
            if (owner != null) owners[node.start] = owner
        }
        val next = if (node.kind in typeKinds) node else owner
        node.children.filter { it.children.isNotEmpty() }.forEach { collect(it, next) }
    }
    init { collect(tree, null) }
    private fun ancestors(offset: Int): List<SyntaxNode> {
        val result = mutableListOf<SyntaxNode>()
        fun visit(node: SyntaxNode) {
            if (offset < node.start || offset >= node.end) return
            result.add(node)
            node.children.firstOrNull { it.start <= offset && offset < it.end }?.let(::visit)
        }
        visit(tree)
        return result
    }
    private fun visible(node: SyntaxNode, offset: Int): Boolean {
        var current: SyntaxNode? = node
        while (current != null) {
            val owner = owners[current.start]
            if (owner != null && (flag(current, "PRIVATE_KEYWORD") || flag(current, "PROTECTED_KEYWORD")) && offset !in owner.start until owner.end) return false
            current = owner
        }
        return true
    }
    private fun declarations(token: SyntaxNode) = index.navigationDefinitionsAt(token.start).mapNotNull { nodes[it.start] }
    private fun members(owner: SyntaxNode): List<SyntaxNode> =
        owner.children.firstOrNull { it.kind == "CLASS_BODY" }?.children.orEmpty().filter { it.kind in declarationKinds } +
        owner.children.firstOrNull { it.kind == "PRIMARY_CONSTRUCTOR" }?.children?.firstOrNull { it.kind == "VALUE_PARAMETER_LIST" }?.children.orEmpty()
            .filter { it.kind == "VALUE_PARAMETER" && it.children.any { c -> c.kind == "VAL_KEYWORD" || c.kind == "VAR_KEYWORD" } }
    private fun select(owner: SyntaxNode, name: String, instance: Boolean, callable: Boolean, offset: Int): List<SyntaxNode> {
        val direct = members(owner).filter { id(it)?.let(::text) == name && visible(it, offset) && it.children.none { c -> c.kind == "DOT" } &&
            (owner.kind == "OBJECT_DECLARATION" || callable || if (instance) it.kind !in staticKinds else it.kind in staticKinds) }
        if (direct.isNotEmpty() || instance) return direct
        return members(owner).filter { it.kind == "OBJECT_DECLARATION" && flag(it, "COMPANION_KEYWORD") }
            .flatMap { select(it, name, false, callable, offset) }
    }
    private fun types(node: SyntaxNode, offset: Int, seen: Set<Int> = emptySet()): List<SyntaxNode> {
        if (node.start in seen) return emptyList()
        if (node.kind in typeKinds) return listOf(node)
        val next = seen + node.start
        val annotation = node.declaredTypePath()
        val path = annotation ?: node.constructorPath()
        if (path == null) {
            if (node.kind != "PROPERTY") return emptyList()
            val initializer = node.children.dropWhile { it.kind != "EQ" }.drop(1).firstOrNull { it.children.isNotEmpty() }
            val alias = initializer?.takeIf { it.kind == "REFERENCE_EXPRESSION" }?.let(::id) ?: return emptyList()
            return declarations(alias).flatMap { types(it, offset, next) }
        }
        val bindings = declarations(path.first())
        if (annotation == null && bindings.any { it.kind !in typeKinds && it.kind != "TYPEALIAS" }) return emptyList()
        var current = bindings.filter { it.kind in typeKinds || it.kind == "TYPEALIAS" }
        for (token in path.drop(1)) current = current.flatMap { types(it, offset, next) }.flatMap { select(it, text(token), false, false, offset) }
        return current.flatMap { types(it, offset, next) }
    }
    private fun pathTargets(path: List<SyntaxNode>, offset: Int, callable: Boolean = false): List<SyntaxNode> {
        if (path.isEmpty()) return emptyList()
        var current = if (path.first().kind == "THIS_EXPRESSION") {
            val context = ancestors(offset)
            val owner = context.indexOfLast { it.kind in typeKinds }
            if (owner < 0 || context.drop(owner + 1).any { it.kind == "FUNCTION_LITERAL" || (it.kind == "FUN" && it.children.any { c -> c.kind == "DOT" }) }) emptyList()
            else listOf(context[owner])
        } else declarations(path.first())
        var instance = path.first().kind == "THIS_EXPRESSION"
        for ((i, token) in path.drop(1).withIndex()) {
            current = current.flatMap { declaration ->
                types(declaration, offset).flatMap { owner -> select(owner, text(token), instance || declaration.kind !in staticKinds, callable && i == path.size - 2, offset) }
            }
            instance = false
        }
        return current.filter { visible(it, offset) }.distinctBy { it.start }
    }
    private fun lexical(token: SyntaxNode, context: List<SyntaxNode>): List<SyntaxNode> {
        val direct = declarations(token)
        // Captured locals are certain; a member across an unknown receiver is only a candidate.
        if (index.definitionsAt(token.start).isNotEmpty()) return direct
        val possible = mutableListOf<SyntaxNode>()
        for ((i, node) in context.withIndex()) {
            if (node.kind != "FUNCTION_LITERAL") continue
            val callIndex = context.take(i).indexOfLast { it.kind == "CALL_EXPRESSION" }
            val qualified = context.getOrNull(callIndex - 1)?.takeIf { it.kind == "DOT_QUALIFIED_EXPRESSION" } ?: continue
            val receiver = qualified.children.firstOrNull { it.children.isNotEmpty() }?.navigationPath() ?: continue
            for (value in pathTargets(receiver, token.start)) for (owner in types(value, token.start)) {
                possible.addAll(select(owner, text(token), true, false, token.start))
            }
        }
        return (possible + direct).distinctBy { it.start }
    }
    private fun target(node: SyntaxNode): DefinitionTarget? = id(node)?.let { DefinitionTarget(node.start, node.end, it.start, it.end) }
    fun definitionsAt(offset: Int): List<DefinitionTarget> {
        val context = ancestors(offset)
        val token = context.lastOrNull()?.takeIf { it.kind == "IDENTIFIER" } ?: return emptyList()
        if (context.any { it.kind in setOf("IMPORT_DIRECTIVE", "PACKAGE_DIRECTIVE") }) return emptyList()
        val parameter = context.any { it.kind == "VALUE_ARGUMENT_NAME" }
        val selectedToken = if (parameter) context.lastOrNull { it.kind == "CALL_EXPRESSION" }?.navigationPath()?.lastOrNull() ?: return emptyList() else token
        val selectedContext = if (parameter) ancestors(selectedToken.start) else context
        val qualified = selectedContext.firstOrNull { it.kind in qualifiedKinds && it.navigationPath()?.any { p -> p.start == selectedToken.start } == true }
        val path = qualified?.navigationPath()
        val position = path?.indexOfFirst { it.start == selectedToken.start } ?: -1
        fun hasReceiverCall(node: SyntaxNode): Boolean = (node.kind == "CALL_EXPRESSION" && node.end <= selectedToken.start) || node.children.any(::hasReceiverCall)
        val candidates = if (path != null && position > 0) {
            if (hasReceiverCall(qualified)) return emptyList()
            pathTargets(path.take(position + 1), offset, qualified.kind == "CALLABLE_REFERENCE_EXPRESSION")
        } else lexical(selectedToken, selectedContext)
        if (!parameter) {
            val resolved = candidates.mapNotNull(::target)
            return if (resolved.isNotEmpty() || position > 0) resolved else index.navigationDefinitionsAt(offset)
        }
        return candidates.flatMap { declaration ->
            val callable = if (declaration.kind == "TYPEALIAS") types(declaration, offset) else listOf(declaration)
            callable.flatMap { node ->
                val owner = if (node.kind == "CLASS") node.children.firstOrNull { it.kind == "PRIMARY_CONSTRUCTOR" } else node.takeIf { it.kind == "FUN" }
                owner?.children?.firstOrNull { it.kind == "VALUE_PARAMETER_LIST" }?.children.orEmpty()
                    .filter { it.kind == "VALUE_PARAMETER" && id(it)?.let(::text) == text(token) }.mapNotNull(::target)
            }
        }.distinctBy { it.nameStart }
    }
}

private val typeKinds = setOf("CLASS", "OBJECT_DECLARATION")
private val staticKinds = typeKinds + setOf("TYPEALIAS", "ENUM_ENTRY")
private val declarationKinds = staticKinds + setOf("FUN", "PROPERTY", "VALUE_PARAMETER")
private val qualifiedKinds = setOf("DOT_QUALIFIED_EXPRESSION", "SAFE_ACCESS_EXPRESSION", "CALLABLE_REFERENCE_EXPRESSION", "USER_TYPE")
