package li.songe.kotlin.tree

/** Compact file metadata for import-based navigation; no bodies or local scopes are retained. */
fun SyntaxNode.fileSymbolsJson(source: String): String {
    fun leaves(node: SyntaxNode): List<SyntaxNode> = if (node.children.isEmpty()) listOf(node) else node.children.flatMap(::leaves)
    fun names(nodes: List<SyntaxNode>) = nodes.filter { it.kind == "IDENTIFIER" }.map { source.substring(it.start, it.end).removeSurrounding("`") }
    fun strings(values: List<String>) = values.joinToString(prefix = "[", postfix = "]") { jsonString(it) }
    val packageTokens = children.firstOrNull { it.kind == "PACKAGE_DIRECTIVE" }?.let(::leaves).orEmpty()
    val packageName = names(packageTokens)
    val imports = children.firstOrNull { it.kind == "IMPORT_LIST" }?.children.orEmpty().filter { it.kind == "IMPORT_DIRECTIVE" }.mapNotNull { node ->
        val tokens = leaves(node)
        if (tokens.any { it.error != null }) return@mapNotNull null
        val path = names(tokens.takeWhile { it.kind != "AS_KEYWORD" })
        if (path.isEmpty()) return@mapNotNull null
        val segments = tokens.filter { it.kind == "IDENTIFIER" }.mapIndexed { index, token ->
            """{"start":${token.start},"end":${token.end},"path":${strings(path.take(index + 1))}}"""
        }
        """{"name":${jsonString(names(tokens).last())},"star":${tokens.any { it.kind == "MUL" }},"path":${strings(path)},"segments":[${segments.joinToString()}],"start":${node.start},"end":${node.end}}"""
    }
    val declarations = mutableListOf<String>()
    fun collect(node: SyntaxNode, owner: List<String>, ownerKind: String, inheritedPrivate: Boolean, aliases: List<List<String>>, ownerNode: SyntaxNode? = null, inheritedScopes: List<SyntaxNode> = emptyList(), ownerRole: String? = null, ownerTypeParameters: List<String> = emptyList()) {
        val isConstructor = node.kind == "PRIMARY_CONSTRUCTOR" || node.kind == "SECONDARY_CONSTRUCTOR"
        if (node.kind !in exportedDeclarationKinds && !isConstructor) return
        if (node.kind == "VALUE_PARAMETER" && node.children.none { it.kind == "VAL_KEYWORD" || it.kind == "VAR_KEYWORD" }) return
        val modifiers = node.children.firstOrNull { it.kind == "MODIFIER_LIST" }?.children.orEmpty()
        val keyword = modifiers.firstOrNull { it.kind == "EXPECT_KEYWORD" || it.kind == "ACTUAL_KEYWORD" }
        val role = when {
            keyword?.kind == "EXPECT_KEYWORD" -> "expect"
            keyword?.kind == "ACTUAL_KEYWORD" -> "actual"
            ownerRole == "expect" -> "expect"
            node.kind == "PRIMARY_CONSTRUCTOR" && ownerRole == "actual" &&
                ownerNode?.children?.firstOrNull { it.kind == "MODIFIER_LIST" }?.children?.any { it.kind == "ANNOTATION_KEYWORD" } == true -> "actual"
            node.kind == "ENUM_ENTRY" -> ownerRole
            else -> null
        }
        if (isConstructor && role == null) return
        val private = inheritedPrivate || modifiers.any { it.kind == "PRIVATE_KEYWORD" || it.kind == "PROTECTED_KEYWORD" }
        val privateScopes = inheritedScopes + if (ownerNode != null && modifiers.any { it.kind == "PRIVATE_KEYWORD" || it.kind == "PROTECTED_KEYWORD" }) listOf(ownerNode) else emptyList()
        val companion = modifiers.any { it.kind == "COMPANION_KEYWORD" }
        val identifier = node.children.firstOrNull { it.kind == "IDENTIFIER" }
            ?: (if (companion) node.children.firstOrNull { it.kind == "OBJECT_KEYWORD" } else null)
            ?: (if (isConstructor) node.children.firstOrNull { it.kind == "CONSTRUCTOR_KEYWORD" }
                ?: node.children.firstOrNull { it.kind == "VALUE_PARAMETER_LIST" }?.children?.firstOrNull { it.kind == "LPAR" } else null) ?: return
        fun text(token: SyntaxNode) = source.substring(token.start, token.end).removeSurrounding("`")
        val name = if (isConstructor) "<init>" else if (companion && identifier.kind != "IDENTIFIER") "Companion" else text(identifier)
        val path = owner + name
        val alternatePaths = aliases.map { it + name }
        val type = node.declaredTypePath()?.map(::text).orEmpty()
        val constructor = node.constructorPath()?.map(::text).orEmpty()
        val static = ownerKind != "CLASS" || node.kind in setOf("CLASS", "OBJECT_DECLARATION", "TYPEALIAS", "ENUM_ENTRY")
        val parameterOwner = if (node.kind == "CLASS") node.children.firstOrNull { it.kind == "PRIMARY_CONSTRUCTOR" } else node.takeIf { it.kind == "FUN" }
        val parameters = parameterOwner?.children?.firstOrNull { it.kind == "VALUE_PARAMETER_LIST" }?.children.orEmpty().filter { it.kind == "VALUE_PARAMETER" }.mapNotNull { p ->
            val id = p.children.firstOrNull { it.kind == "IDENTIFIER" } ?: return@mapNotNull null
            """{"name":${jsonString(text(id))},"start":${p.start},"end":${p.end},"nameStart":${id.start},"nameEnd":${id.end}}"""
        }
        val typeParameters = ownerTypeParameters + node.children.firstOrNull { it.kind == "TYPE_PARAMETER_LIST" }?.children.orEmpty()
            .filter { it.kind == "TYPE_PARAMETER" }.mapNotNull { it.children.firstOrNull { c -> c.kind == "IDENTIFIER" }?.let(::text) }
        val expectActual = role?.let { ",\"expectActual\":" + node.expectActualJson(source, it, keyword, typeParameters) }.orEmpty()
        val kind = if (isConstructor) "CONSTRUCTOR" else node.kind
        declarations.add("""{"name":${jsonString(name)},"kind":${jsonString(kind)},"path":${strings(path)},"aliases":[${alternatePaths.joinToString { strings(it) }}],"private":$private,"privateScopes":[${privateScopes.joinToString { "[${it.start},${it.end}]" }}],"static":$static,"typePath":${strings(type)},"constructorPath":${strings(constructor)},"parameters":[${parameters.joinToString()}],"extension":${node.children.any { it.kind == "DOT" }},"start":${node.start},"end":${node.end},"nameStart":${identifier.start},"nameEnd":${identifier.end}$expectActual}""")
        if (node.kind == "OBJECT_DECLARATION" || node.kind == "CLASS") {
            val memberAliases = alternatePaths + if (companion) listOf(owner) else emptyList()
            node.children.firstOrNull { it.kind == "CLASS_BODY" }?.children?.forEach { collect(it, path, node.kind, private, memberAliases, node, privateScopes, role, typeParameters) }
            node.children.firstOrNull { it.kind == "PRIMARY_CONSTRUCTOR" }?.let { primary ->
                collect(primary, path, node.kind, private, emptyList(), node, privateScopes, role, typeParameters)
                primary.children.firstOrNull { it.kind == "VALUE_PARAMETER_LIST" }?.children?.forEach { collect(it, path, node.kind, private, emptyList(), node, privateScopes, role, typeParameters) }
            }
        }
    }
    children.forEach { collect(it, emptyList(), "FILE", false, emptyList()) }
    return """{"packageName":${strings(packageName)},"imports":[${imports.joinToString()}],"declarations":[${declarations.joinToString()}]}"""
}

private val exportedDeclarationKinds = setOf("CLASS", "OBJECT_DECLARATION", "FUN", "PROPERTY", "TYPEALIAS", "ENUM_ENTRY", "VALUE_PARAMETER")
