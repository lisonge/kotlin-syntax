package li.songe.kotlin.tree

/** Bounded to this tree: declaration types, stable initializers and branch-local facts. */
internal class LocalTypeAnalysis(
    private val tree: SyntaxNode,
    private val source: String,
    private val index: DefinitionIndex,
    private val bindings: MutableMap<Int, Int?>,
    private val paint: (Int, Int) -> Unit,
    private val qualifiedReceiver: (SyntaxNode) -> Unit,
) {
    private data class Receiver(val owner: SyntaxNode, val instance: Boolean)
    private val declarations = mutableMapOf<Int, SyntaxNode>()
    private val members = mutableMapOf<Int, Map<String, List<SyntaxNode>>>()
    private val localValues = mutableSetOf<Int>()
    private val plainReceiverPaths = mutableSetOf<Int>()
    private val baseCache = mutableMapOf<Int, List<SyntaxNode>>()
    private val knownValues = mutableMapOf<Int, Receiver>()
    private val annotatedTypes = mutableMapOf<Int, SyntaxNode?>()
    private val memberCache = mutableMapOf<Triple<Int, Boolean, String>, List<SyntaxNode>>()
    private fun lookup(receiver: Receiver, name: String): List<SyntaxNode> =
        memberCache.getOrPut(Triple(ownerKey(receiver.owner), receiver.instance, name)) { member(receiver, name) }
    private fun id(node: SyntaxNode) = node.children.firstOrNull { it.kind == "IDENTIFIER" }
    private fun ownerKey(node: SyntaxNode) = id(node)?.start ?: node.start
    private fun text(node: SyntaxNode) = source.substring(node.start, node.end).removeSurrounding("`")
    private fun binding(token: SyntaxNode): Int? = if (bindings.containsKey(token.start)) bindings[token.start] else
        index.definitionsAt(token.start).singleOrNull()?.nameStart.also { bindings[token.start] = it }
    private fun composites(node: SyntaxNode) = node.children.filter { it.children.isNotEmpty() }
    private fun initializer(node: SyntaxNode) = node.children.dropWhile { it.kind != "EQ" }.drop(1).firstOrNull { it.children.isNotEmpty() }
    private fun extension(node: SyntaxNode) = node.children.any { it.kind == "DOT" }
    private fun modifier(node: SyntaxNode, kind: String) = node.children.firstOrNull { it.kind == "MODIFIER_LIST" }?.children?.any { it.kind == kind } == true

    private fun collect(node: SyntaxNode, inFunction: Boolean = false) {
        if (node.children.isEmpty()) return
        val identifier = if (node.kind in declarationKinds) id(node) else null
        if (identifier != null && node.kind in declarationKinds) {
            declarations[identifier.start] = node
            if (inFunction && node.kind == "PROPERTY" && node.children.any { it.kind == "VAL_KEYWORD" } &&
                node.children.none { it.kind == "PROPERTY_ACCESSOR" || it.kind == "BY_KEYWORD" }) localValues.add(identifier.start)
        }
        if (node.kind in ownerKinds) {
            val direct = node.children.firstOrNull { it.kind == "CLASS_BODY" }?.children.orEmpty().filter { it.kind in declarationKinds }.toMutableList()
            direct += node.children.firstOrNull { it.kind == "PRIMARY_CONSTRUCTOR" }?.children?.firstOrNull { it.kind == "VALUE_PARAMETER_LIST" }?.children.orEmpty()
                .filter { it.kind == "VALUE_PARAMETER" && it.children.any { token -> token.kind == "VAL_KEYWORD" || token.kind == "VAR_KEYWORD" } }
            members[ownerKey(node)] = direct.filter { id(it) != null }.groupBy { text(id(it)!!) }
        }
        val function = when (node.kind) { "CLASS", "OBJECT_DECLARATION" -> false; "FUN", "FUNCTION_LITERAL" -> true; else -> inFunction }
        node.children.forEach { collect(it, function) }
    }

    private fun typePath(path: List<SyntaxNode>?, seen: Set<Int> = emptySet()): SyntaxNode? {
        if (path.isNullOrEmpty()) return null
        var node = binding(path.first())?.let { declarations[it] } ?: return null
        for (token in path.drop(1)) node = lookup(Receiver(node, false), text(token)).singleOrNull() ?: return null
        if (node.kind == "TYPEALIAS") {
            val key = id(node)?.start ?: return null
            if (key in seen) return null
            return typePath(node.declaredTypePath(), seen + key)
        }
        return node.takeIf { it.kind in ownerKinds }
    }

    private fun bases(owner: SyntaxNode): List<SyntaxNode> {
        val key = ownerKey(owner)
        return baseCache.getOrPut(key) {
            owner.children.firstOrNull { it.kind == "SUPER_TYPE_LIST" }?.children.orEmpty().mapNotNull { entry ->
                val type = entry.children.firstOrNull { it.kind == "TYPE_REFERENCE" }
                    ?: entry.children.firstOrNull { it.kind == "CONSTRUCTOR_CALLEE" }?.children?.firstOrNull { it.kind == "TYPE_REFERENCE" }
                typePath(type?.navigationPath())
            }
        }
    }

    private fun member(receiver: Receiver, name: String, seen: Set<Int> = emptySet()): List<SyntaxNode> {
        val owner = receiver.owner
        val key = ownerKey(owner)
        if (key in seen) return emptyList()
        val next = seen + key
        val direct = members[key]?.get(name).orEmpty().filter { !extension(it) &&
            (owner.kind == "OBJECT_DECLARATION" || if (receiver.instance) it.kind !in staticKinds else it.kind in staticKinds) }
        if (direct.isNotEmpty()) return direct
        if (!receiver.instance) {
            val companion = owner.children.firstOrNull { it.kind == "CLASS_BODY" }?.children?.singleOrNull {
                it.kind == "OBJECT_DECLARATION" && modifier(it, "COMPANION_KEYWORD") }
            if (companion != null) {
                // Anonymous companions have no identifier, so use their body directly.
                val found = companion.children.firstOrNull { it.kind == "CLASS_BODY" }?.children.orEmpty()
                    .filter { id(it)?.let(::text) == name && !extension(it) }
                if (found.isNotEmpty()) return found
            }
            return emptyList()
        }
        return bases(owner).flatMap { member(Receiver(it, true), name, next) }
            .filter { !modifier(it, "PRIVATE_KEYWORD") }.distinctBy { id(it)?.start }
    }

    private fun stable(key: Int): Boolean {
        val node = declarations[key] ?: return false
        return key in localValues || (node.kind == "VALUE_PARAMETER" && node.children.none { it.kind == "VAL_KEYWORD" || it.kind == "VAR_KEYWORD" })
    }

    private fun referenced(token: SyntaxNode, owner: SyntaxNode?): SyntaxNode? {
        val bound = binding(token)
        if (bound != null) return declarations[bound]
        if (owner == null) return null
        val target = lookup(Receiver(owner, true), text(token)).singleOrNull() ?: return null
        if (index.definitionsAt(token.start).isNotEmpty() || index.externalReferenceAt(token.start)?.importOnly == true) return null
        id(target)?.let { paint(token.start, it.start) }
        return target
    }

    private fun value(node: SyntaxNode, facts: Map<Int, Receiver>, seen: Set<Int> = emptySet()): Receiver? {
        val key = id(node)?.start ?: return null
        if (key in seen) return null
        facts[key]?.let { return it }
        if (node.kind in ownerKinds) return Receiver(node, false)
        if (node.kind == "TYPEALIAS") return typePath(node.declaredTypePath())?.let { Receiver(it, false) }
        val annotation = node.declaredTypePath()
        // An explicit (even external) type takes precedence over initializer guesses.
        if (annotation != null) {
            if (!annotatedTypes.containsKey(key)) annotatedTypes[key] = typePath(annotation)
            return annotatedTypes[key]?.let { Receiver(it, true) }
        }
        if (node.kind != "PROPERTY" || node.children.none { it.kind == "VAL_KEYWORD" } ||
            node.children.any { it.kind == "PROPERTY_ACCESSOR" || it.kind == "BY_KEYWORD" }) return null
        knownValues[key]?.let { return it }
        return initializer(node)?.let { expression(it, null, facts, seen + key) }
    }

    private fun expression(node: SyntaxNode, owner: SyntaxNode?, facts: Map<Int, Receiver>, seen: Set<Int> = emptySet()): Receiver? = when (node.kind) {
        "REFERENCE_EXPRESSION" -> node.children.firstOrNull { it.kind == "IDENTIFIER" }?.let { referenced(it, owner) }?.let { value(it, facts, seen) }
        "THIS_EXPRESSION" -> if (node.children.any { it.kind == "LABEL_QUALIFIER" }) null else owner?.let { Receiver(it, true) }
        "PARENTHESIZED" -> composites(node).singleOrNull()?.let { expression(it, owner, facts, seen) }
        "BINARY_WITH_TYPE" -> typePath(node.children.firstOrNull { it.kind == "TYPE_REFERENCE" }?.navigationPath())?.let { Receiver(it, true) }
        "CALL_EXPRESSION" -> {
            val callee = node.children.firstOrNull { it.kind == "REFERENCE_EXPRESSION" }
            val target = callee?.children?.firstOrNull { it.kind == "IDENTIFIER" }?.let { binding(it) }?.let { declarations[it] }
            if (target?.kind == "CLASS" || target?.kind == "TYPEALIAS") value(target, facts, seen)?.copy(instance = true) else null
        }
        "DOT_QUALIFIED_EXPRESSION", "SAFE_ACCESS_EXPRESSION" -> {
            val parts = composites(node)
            if (parts.size != 2) null else {
                val receiver = expression(parts[0], owner, facts, seen)
                val selector = if (parts[1].kind == "CALL_EXPRESSION") parts[1].children.firstOrNull { it.kind == "REFERENCE_EXPRESSION" } else parts[1]
                val name = selector?.children?.firstOrNull { it.kind == "IDENTIFIER" }
                val selected = if (receiver != null && name != null) lookup(receiver, text(name)).singleOrNull() else null
                if (selected != null && name != null) {
                    id(selected)?.let { paint(name.start, it.start) }
                    if (parts[1].kind == "CALL_EXPRESSION") {
                        if (selected.kind == "CLASS" || selected.kind == "TYPEALIAS") value(selected, facts, seen)?.copy(instance = true) else null
                    } else value(selected, facts, seen)
                } else null
            }
        }
        else -> null
    }

    private fun narrow(condition: SyntaxNode?, positive: Boolean, facts: Map<Int, Receiver>): Map<Int, Receiver> {
        if (condition == null) return facts
        if (condition.kind == "CONDITION" || condition.kind == "PARENTHESIZED") return narrow(composites(condition).singleOrNull(), positive, facts)
        if (condition.kind == "BINARY_EXPRESSION" && positive && condition.children.firstOrNull { it.kind == "OPERATION_REFERENCE" }?.let(::text) == "&&") {
            val parts = composites(condition).filter { it.kind != "OPERATION_REFERENCE" }
            return if (parts.size == 2) narrow(parts[1], true, narrow(parts[0], true, facts)) else facts
        }
        if (condition.kind != "IS_EXPRESSION") return facts
        val negated = condition.children.firstOrNull { it.kind == "OPERATION_REFERENCE" }?.let(::text) == "!is"
        if (positive == negated) return facts
        val token = condition.children.firstOrNull { it.kind == "REFERENCE_EXPRESSION" }?.children?.firstOrNull { it.kind == "IDENTIFIER" } ?: return facts
        val key = binding(token) ?: return facts
        if (!stable(key)) return facts
        val type = typePath(condition.children.firstOrNull { it.kind == "TYPE_REFERENCE" }?.navigationPath()) ?: return facts
        return facts + (key to Receiver(type, true))
    }

    private fun visit(node: SyntaxNode, owner: SyntaxNode?, facts: Map<Int, Receiver>, qualifiedChild: Boolean = false, parentKind: String? = null) {
        if (node.children.isEmpty()) return
        val currentOwner = when {
            node.kind in ownerKinds -> node
            node.kind == "FUNCTION_LITERAL" -> null
            (node.kind == "FUN" || node.kind == "PROPERTY") && extension(node) ->
                typePath(node.children.takeWhile { it.kind != "DOT" }.lastOrNull { it.kind == "TYPE_REFERENCE" }?.navigationPath())
            else -> owner
        }
        val currentFacts = if (node.kind in ownerKinds || node.kind == "FUNCTION_LITERAL") emptyMap() else facts
        if (node.kind == "BINARY_EXPRESSION") {
            val operation = node.children.firstOrNull { it.kind == "OPERATION_REFERENCE" }?.let(::text)
            val parts = composites(node).filter { it.kind != "OPERATION_REFERENCE" }
            if (operation in setOf("&&", "||") && parts.size == 2) {
                visit(parts[0], currentOwner, currentFacts)
                visit(parts[1], currentOwner, narrow(parts[0], operation == "&&", currentFacts))
                return
            }
        }
        if (node.kind == "IF") {
            val condition = node.children.firstOrNull { it.kind == "CONDITION" }
            for (child in node.children) visit(child, currentOwner, when (child.kind) {
                "THEN" -> narrow(condition, true, currentFacts)
                "ELSE" -> narrow(condition, false, currentFacts)
                else -> currentFacts
            })
            return
        }
        if (node.kind == "WHEN") {
            val subject = node.children.firstOrNull { it.kind == "REFERENCE_EXPRESSION" }?.children?.firstOrNull { it.kind == "IDENTIFIER" }?.let { binding(it) }
            for (child in node.children) {
                var branch = currentFacts
                val conditions = child.children.filter { it.kind.startsWith("WHEN_CONDITION") }
                val condition = conditions.singleOrNull()
                if (subject != null && stable(subject) && condition?.kind == "WHEN_CONDITION_IS_PATTERN" && condition.children.none { it.kind == "NOT_IS" }) {
                    typePath(condition.children.firstOrNull { it.kind == "TYPE_REFERENCE" }?.navigationPath())?.let { branch = branch + (subject to Receiver(it, true)) }
                } else if (subject == null && condition?.kind == "WHEN_CONDITION_EXPRESSION") branch = narrow(composites(condition).singleOrNull(), true, branch)
                visit(child, currentOwner, branch)
            }
            return
        }
        for (child in node.children) visit(child, currentOwner, currentFacts,
            node.kind in qualifiedKinds && child.kind in qualifiedKinds, node.kind)
        if (node.kind == "REFERENCE_EXPRESSION" && parentKind !in nonLexicalParents && currentOwner != null) {
            node.children.firstOrNull { it.kind == "IDENTIFIER" }?.let { referenced(it, currentOwner) }
        }
        if (node.kind in qualifiedKinds && !qualifiedChild) expression(node, currentOwner, currentFacts)
        if (node.kind == "DOT_QUALIFIED_EXPRESSION") {
            val parts = composites(node)
            val receiver = parts.firstOrNull()
            val selector = parts.lastOrNull()
            // Children were visited first: reuse their path validity without rescanning long chains.
            val plain = receiver?.kind == "REFERENCE_EXPRESSION" ||
                (receiver?.kind == "DOT_QUALIFIED_EXPRESSION" && receiver.end in plainReceiverPaths)
            if (parts.size == 2 && plain) {
                if (selector?.kind == "REFERENCE_EXPRESSION") plainReceiverPaths.add(node.end)
                if (selector?.kind in setOf("CALL_EXPRESSION", "REFERENCE_EXPRESSION")) {
                    val segment = if (receiver?.kind == "REFERENCE_EXPRESSION") receiver else receiver?.children?.lastOrNull { it.children.isNotEmpty() }
                    segment?.let(::id)?.let(qualifiedReceiver)
                }
            }
        }
        if (node.kind == "USER_TYPE" && node.children.any { it.kind == "USER_TYPE" }) {
            val path = node.navigationPath()
            typePath(path)?.let { target -> id(target)?.let { paint(path!!.last().start, it.start) } }
        }
        if (node.kind == "PROPERTY" && id(node)?.start in localValues) {
            initializer(node)?.let { expression(it, currentOwner, currentFacts) }?.let { knownValues[id(node)!!.start] = it }
        }
    }

    fun run() { collect(tree); visit(tree, null, emptyMap()) }
}

private val ownerKinds = setOf("CLASS", "OBJECT_DECLARATION")
private val staticKinds = setOf("CLASS", "OBJECT_DECLARATION", "TYPEALIAS", "ENUM_ENTRY")
private val declarationKinds = staticKinds + setOf("PROPERTY", "VALUE_PARAMETER", "FUN")
private val qualifiedKinds = setOf("DOT_QUALIFIED_EXPRESSION", "SAFE_ACCESS_EXPRESSION")
private val nonLexicalParents = qualifiedKinds + setOf("USER_TYPE", "CALLABLE_REFERENCE_EXPRESSION", "VALUE_ARGUMENT_NAME", "IMPORT_DIRECTIVE", "PACKAGE_DIRECTIVE")
