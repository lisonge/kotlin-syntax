package li.songe.kotlin.tree

/** A same-document destination. All ranges use UTF-16 offsets and exclusive ends. */
data class DefinitionTarget(val start: Int, val end: Int, val nameStart: Int, val nameEnd: Int)
data class ExternalReference(val name: String, val type: Boolean, val constructorOnly: Boolean = false, val importOnly: Boolean = false)

/** Lexical bindings only: no inferred receiver types, overload selection or external lookup. */
class DefinitionIndex(tree: SyntaxNode, private val source: String) {
    private class Scope(
        val parent: Scope?, val kind: String,
        val sequential: Boolean = false,
        val unknownReceiver: Boolean = false,
        val implicitNames: Set<String> = emptySet(),
        val hidesOuterMembers: Boolean = false,
        val parameterFrom: Int? = null,
    ) {
        val names = mutableMapOf<String, MutableList<Binding>>()
    }
    private data class Binding(
        val target: DefinitionTarget, val from: Int, val type: Boolean,
        val instance: Boolean = false, val extension: Boolean = false,
        val constructor: Boolean = false,
    )
    private data class Reference(val node: SyntaxNode, val scope: Scope, val type: Boolean, val call: Boolean, val typeEvidence: Boolean, val qualifier: Boolean)
    private val references = mutableListOf<Reference>()
    private val imports = mutableMapOf<String, MutableList<DefinitionTarget>>()
    private val path = mutableListOf<SyntaxNode>()

    init { visit(tree, Scope(null, "file")) }

    fun definitionsAt(offset: Int): List<DefinitionTarget> = resolve(offset) {}

    /** Navigation may offer known enclosing and file declarations across an unknown receiver. */
    fun navigationDefinitionsAt(offset: Int): List<DefinitionTarget> = resolve(offset, navigationCandidates = true) {}

    /** Type-use evidence is keyed by import identity or lexical scope, never a global name set. */
    internal fun typeEvidenceReferences(): Set<Int> {
        val importedTypes = mutableSetOf<Int>()
        val scopedTypes = mutableMapOf<Scope, MutableSet<String>>()
        val evidenceNames = mutableSetOf<String>()
        for (reference in references) {
            if (!reference.typeEvidence) continue
            val name = name(reference.node)
            val imported = imports[name]?.singleOrNull()
            var external: ExternalReference? = null
            val targets = resolve(reference.node.start) { external = it }
            if (imported != null && targets.singleOrNull() == imported) {
                importedTypes.add(imported.nameStart)
                evidenceNames.add(name)
            } else if (targets.isEmpty() && external != null && imports[name].isNullOrEmpty()) {
                scopedTypes.getOrPut(reference.scope) { mutableSetOf() }.add(name)
                evidenceNames.add(name)
            }
        }
        if (evidenceNames.isEmpty()) return emptySet()
        val result = mutableSetOf<Int>()
        for (reference in references) {
            if (reference.type) continue
            val name = name(reference.node)
            if (name !in evidenceNames) continue
            val imported = imports[name]?.singleOrNull()
            var external: ExternalReference? = null
            val targets = resolve(reference.node.start) { external = it }
            if (imported != null) {
                if (imported.nameStart in importedTypes && (targets.singleOrNull() == imported || external?.importOnly == true)) result.add(reference.node.start)
            } else if (targets.isEmpty() && external != null && imports[name].isNullOrEmpty()) {
                var scope: Scope? = reference.scope
                while (scope != null) {
                    if (name in scopedTypes[scope].orEmpty()) { result.add(reference.node.start); break }
                    scope = scope.parent
                }
            }
        }
        return result
    }

    fun externalReferenceAt(offset: Int): ExternalReference? {
        var reference: ExternalReference? = null
        resolve(offset) { reference = it }
        return reference
    }

    private fun resolve(offset: Int, navigationCandidates: Boolean = false, unresolved: (ExternalReference) -> Unit): List<DefinitionTarget> {
        val index = references.binarySearch { reference ->
            when {
                reference.node.end <= offset -> -1
                reference.node.start > offset -> 1
                else -> 0
            }
        }
        if (index < 0) return emptyList()
        val reference = references[index]
        val name = name(reference.node)
        var scope: Scope? = reference.scope
        var unknownReceiver = false
        var hideMembers = false
        var members: List<DefinitionTarget>? = null
        while (scope != null) {
            if (scope.kind == "file" && members != null) return members
            val matches = scope.names[name].orEmpty().filter {
                it.from <= offset && (!reference.type || it.type) && !(hideMembers && it.instance)
            }
            if (matches.isNotEmpty()) {
                val constructorsOnly = reference.call && unknownReceiver && !navigationCandidates && (scope.kind == "file" || scope.kind == "class")
                val typesOnly = unknownReceiver && !reference.type && !reference.call && !navigationCandidates && (scope.kind == "file" || scope.kind == "class")
                val targets = matches.filter { !it.extension && (!constructorsOnly || it.constructor) && (!typesOnly || it.type) }.map { it.target }.distinct()
                if (!reference.type && scope.kind == "class") {
                    // Captured lexical locals take precedence over implicit receiver members.
                    if (members == null) members = targets
                } else {
                    if (scope.kind == "file" && imports.containsKey(name)) return emptyList()
                    return targets
                }
            }
            // Without an expected function type, an omitted parameter list may introduce a new it.
            if (!reference.type && name in scope.implicitNames) return emptyList()
            unknownReceiver = unknownReceiver || scope.unknownReceiver
            hideMembers = hideMembers || scope.hidesOuterMembers
            scope = scope.parent
        }
        if (members != null) return members
        if (!reference.type && unknownReceiver) {
            if (imports.containsKey(name)) unresolved(ExternalReference(name, type = false, importOnly = true))
            else if (reference.call) unresolved(ExternalReference(name, type = true, constructorOnly = true))
            else if (reference.qualifier) unresolved(ExternalReference(name, type = true))
            return emptyList()
        }
        val imported = imports[name].orEmpty()
        if (imported.isEmpty()) unresolved(ExternalReference(name, reference.type))
        return imported
    }

    private fun name(node: SyntaxNode) = source.substring(node.start, node.end).removeSurrounding("`")
    private fun SyntaxNode.identifier() = children.firstOrNull { it.kind == "IDENTIFIER" }
    private fun SyntaxNode.hasReceiver() = children.any { it.kind == "DOT" }
    private fun declare(node: SyntaxNode, scope: Scope, from: Int? = null, instance: Boolean = false) {
        val identifier = node.identifier() ?: return
        val name = name(identifier)
        if (name == "_") return
        val type = node.kind in typeDeclarationKinds
        val visible = from ?: if (scope.sequential) {
            if (node.kind == "PROPERTY" || node.kind == "DESTRUCTURING_DECLARATION_ENTRY") node.end else node.start
        } else 0
        scope.names.getOrPut(name) { mutableListOf() }.add(Binding(
            DefinitionTarget(node.start, node.end, identifier.start, identifier.end), visible, type,
            instance, node.hasReceiver(), node.kind == "CLASS" || node.kind == "TYPEALIAS",
        ))
    }

    private fun visit(node: SyntaxNode, outer: Scope, initializer: Scope? = null) {
        // Bindings and references are represented by composite nodes, never token leaves.
        if (node.children.isEmpty()) return
        if (node.kind == "IMPORT_DIRECTIVE") {
            fun leaves(n: SyntaxNode): List<SyntaxNode> = if (n.children.isEmpty()) listOf(n) else n.children.flatMap(::leaves)
            val tokens = leaves(node)
            if (tokens.none { it.kind == "MUL" } && tokens.none { it.error != null }) {
                val identifier = tokens.lastOrNull { it.kind == "IDENTIFIER" }
                if (identifier != null) imports.getOrPut(name(identifier)) { mutableListOf() }.add(
                    DefinitionTarget(node.start, node.end, identifier.start, identifier.end))
            }
            return
        }
        if (node.kind in ignoredDefinitionKinds) return
        if (node.kind == "REFERENCE_EXPRESSION") {
            val identifier = node.identifier()
            if (identifier != null && isUnqualified(identifier)) {
                val type = path.any { it.kind == "TYPE_REFERENCE" }
                val evidence = type && path.subList(path.indexOfLast { it.kind == "TYPE_REFERENCE" }, path.size).count { it.kind == "USER_TYPE" } == 1 &&
                    !(path.any { it.kind == "CONSTRUCTOR_CALLEE" } && path.any { it.kind == "ANNOTATION_ENTRY" })
                val qualifier = path.lastOrNull()?.let { parent -> parent.kind in qualifiedDefinitionKinds && parent.children.firstOrNull { it.children.isNotEmpty() } === node && parent.children.any { it.kind in definitionSeparatorKinds && it.start >= node.end } } == true
                references.add(Reference(identifier, outer, type, path.lastOrNull()?.kind == "CALL_EXPRESSION", evidence, qualifier))
            }
            return
        }
        path.add(node)
        when (node.kind) {
            "CLASS", "OBJECT_DECLARATION" -> visitClass(node, outer)
            "ENUM_ENTRY" -> {
                declare(node, outer)
                val scope = Scope(outer, "class")
                node.children.forEach { visit(it, if (it.kind == "CLASS_BODY") scope else outer) }
            }
            "FUN", "TYPEALIAS" -> {
                declare(node, outer, instance = outer.kind == "class" && node.kind == "FUN")
                val scope = Scope(outer, "local", unknownReceiver = node.hasReceiver())
                node.children.forEach { visit(it, scope) }
            }
            "PROPERTY" -> {
                declare(node, outer, instance = outer.kind == "class")
                val scope = Scope(outer, "local", unknownReceiver = node.hasReceiver())
                val equals = node.children.firstOrNull { it.kind == "EQ" }
                node.children.forEach {
                    visit(it, if (initializer != null && equals != null && it.start > equals.start && it.kind != "PROPERTY_ACCESSOR") initializer else scope)
                }
            }
            "TYPE_PARAMETER" -> {
                declare(node, outer, instance = outer.kind == "class")
                node.children.forEach { visit(it, outer) }
            }
            "VALUE_PARAMETER" -> {
                if (path.none { it.kind == "FUNCTION_TYPE" }) declare(node, outer, from = outer.parameterFrom ?: node.end)
                node.children.forEach { visit(it, outer) }
            }
            "DESTRUCTURING_DECLARATION" -> {
                for (entry in node.children.filter { it.kind == "DESTRUCTURING_DECLARATION_ENTRY" }) {
                    declare(entry, outer, from = outer.parameterFrom ?: node.end)
                }
                node.children.forEach { visit(it, outer) }
            }
            "BLOCK", "SCRIPT", "WHEN", "WHEN_ENTRY", "THEN", "ELSE", "BODY" -> {
                val scope = Scope(outer, "local", sequential = true)
                node.children.forEach { visit(it, scope) }
            }
            "FUNCTION_LITERAL", "FOR", "CATCH", "SECONDARY_CONSTRUCTOR", "PROPERTY_ACCESSOR" -> {
                val scope = Scope(outer, "local",
                    unknownReceiver = node.kind == "FUNCTION_LITERAL",
                    implicitNames = when {
                        node.kind == "FUNCTION_LITERAL" && node.children.none { it.kind == "VALUE_PARAMETER_LIST" } -> setOf("it")
                        node.kind == "PROPERTY_ACCESSOR" -> setOf("field")
                        else -> emptySet()
                    },
                    parameterFrom = if (node.kind == "FOR") node.children.firstOrNull { it.kind == "BODY" }?.start ?: node.end else null)
                node.children.forEach { visit(it, scope) }
            }
            else -> node.children.forEach { visit(it, outer) }
        }
        path.removeAt(path.lastIndex)
    }

    private fun visitClass(node: SyntaxNode, outer: Scope) {
        declare(node, outer)
        val modifiers = node.children.firstOrNull { it.kind == "MODIFIER_LIST" }?.children.orEmpty()
        val scope = Scope(outer, "class",
            unknownReceiver = node.children.any { it.kind == "SUPER_TYPE_LIST" },
            hidesOuterMembers = modifiers.none { it.kind == "INNER_KEYWORD" })
        val constructor = Scope(scope, "local")
        for (child in node.children) {
            when (child.kind) {
                "PRIMARY_CONSTRUCTOR" -> {
                    val parameters = child.children.firstOrNull { it.kind == "VALUE_PARAMETER_LIST" }?.children.orEmpty()
                    for (parameter in parameters.filter { it.kind == "VALUE_PARAMETER" }) {
                        if (parameter.children.any { it.kind == "VAL_KEYWORD" || it.kind == "VAR_KEYWORD" }) declare(parameter, scope, from = child.end, instance = true)
                    }
                    visit(child, constructor)
                }
                "CLASS_BODY" -> {
                    path.add(child)
                    for (member in child.children) {
                        visit(member, if (member.kind == "CLASS_INITIALIZER") constructor else scope,
                            if (member.kind == "PROPERTY") constructor else null)
                    }
                    path.removeAt(path.lastIndex)
                }
                "SUPER_TYPE_LIST" -> visit(child, constructor)
                else -> visit(child, scope)
            }
        }
    }

    private fun isUnqualified(reference: SyntaxNode): Boolean {
        val parent = path.lastOrNull()
        // Only the first component of a qualified type can be looked up lexically.
        if (parent?.kind == "USER_TYPE" && parent.children.any { it.kind == "USER_TYPE" }) return false
        for ((index, ancestor) in path.withIndex()) {
            if (ancestor.kind in qualifiedDefinitionKinds) {
                val separator = ancestor.children.firstOrNull { it.kind in definitionSeparatorKinds } ?: continue
                if (ancestor.kind == "CALLABLE_REFERENCE_EXPRESSION" && ancestor.children.none { it.end <= separator.start && it.children.isNotEmpty() }) continue
                // Arguments and nested lambdas are independent of the qualified callee.
                if ((path.getOrNull(index + 1)?.start ?: reference.start) < separator.end) continue
                var selector = true
                for (tail in index + 1..path.lastIndex) {
                    if (path[tail].kind !in definitionSelectorKinds) { selector = false; break }
                }
                if (selector) return false
            }
        }
        return true
    }
}

private val typeDeclarationKinds = setOf("CLASS", "OBJECT_DECLARATION", "TYPEALIAS", "TYPE_PARAMETER")
private val ignoredDefinitionKinds = setOf("PACKAGE_DIRECTIVE", "VALUE_ARGUMENT_NAME", "THIS_EXPRESSION", "SUPER_EXPRESSION", "LABEL_QUALIFIER")
private val qualifiedDefinitionKinds = setOf("DOT_QUALIFIED_EXPRESSION", "SAFE_ACCESS_EXPRESSION", "CALLABLE_REFERENCE_EXPRESSION")
private val definitionSeparatorKinds = setOf("DOT", "SAFE_ACCESS", "COLONCOLON")
private val definitionSelectorKinds = setOf("CALL_EXPRESSION", "DOT_QUALIFIED_EXPRESSION", "SAFE_ACCESS_EXPRESSION")
