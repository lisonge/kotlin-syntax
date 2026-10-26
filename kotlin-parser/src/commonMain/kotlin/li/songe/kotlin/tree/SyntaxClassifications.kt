package li.songe.kotlin.tree

/**
 * Classify syntax leaves without resolving symbols or applying a color theme.
 * Whitespace and unclassified punctuation are omitted; use tokenize() for all lexer tokens.
 */
fun SyntaxNode.classifySyntax(): List<SyntaxClassification> = buildList {
    val data = classificationData()
    for (i in data.indices step 4) {
        val bits = data[i + 3]
        val modifiers = if (bits == 0) emptySet() else buildSet {
            for (modifier in TokenModifier.entries) if (bits and modifier.mask != 0) add(modifier)
        }
        add(SyntaxClassification(data[i], data[i + 1], TokenType.entries[data[i + 2]], modifiers))
    }
}

/** The same classifications as classifySyntax(), without per-span objects or modifier sets. */
internal fun SyntaxNode.classificationData(): IntArray {
    var data = IntArray(128)
    var size = 0
    val parents = mutableListOf<SyntaxNode>()
    fun visit(node: SyntaxNode) {
        if (node.children.isNotEmpty()) {
            parents.add(node)
            node.children.forEach(::visit)
            parents.removeAt(parents.lastIndex)
            return
        }
        if (node.end <= node.start) return
        val kind = node.kind
        val parent = parents.lastOrNull()
        var declaration = false
        var modifiers = if (kind == "DOC_COMMENT") TokenModifier.DOCUMENTATION.mask else 0
        val type = when {
            kind in commentKinds -> TokenType.COMMENT
            kind in stringKinds -> TokenType.STRING
            kind == "INTEGER_LITERAL" || kind == "FLOAT_LITERAL" -> TokenType.NUMBER
            kind.endsWith("_KEYWORD") || kind in keywordKinds -> TokenType.KEYWORD
            kind == "IDENTIFIER" -> {
                val declared = declarationKinds[parent?.kind]
                declaration = declared != null
                val flags = parent?.children?.firstOrNull { it.kind == "MODIFIER_LIST" }?.children.orEmpty()
                // Only inspect the declaration itself: nested modifiers belong to other symbols.
                if (declared != null && parent != null) {
                    if (parent.children.any { it.kind == "VAL_KEYWORD" }) modifiers = modifiers or TokenModifier.READONLY.mask
                    if (flags.any { it.kind == "ABSTRACT_KEYWORD" }) modifiers = modifiers or TokenModifier.ABSTRACT.mask
                    if (flags.any { it.kind == "SUSPEND_KEYWORD" }) modifiers = modifiers or TokenModifier.ASYNC.mask
                }
                var container: SyntaxNode? = null
                for (i in parents.lastIndex - 1 downTo 0) {
                    val ancestor = parents[i]
                    if (ancestor.kind in scopeKinds && !(ancestor.kind == "BLOCK" && parents.getOrNull(i - 1)?.kind == "SCRIPT")) {
                        container = ancestor
                        break
                    }
                }
                when {
                    parent?.kind == "CLASS" && parent.children.any { it.kind == "INTERFACE_KEYWORD" } -> TokenType.INTERFACE
                    parent?.kind == "CLASS" && flags.any { it.kind == "ENUM_KEYWORD" } -> TokenType.ENUM
                    parent?.kind == "CLASS" && flags.any { it.kind == "ANNOTATION_KEYWORD" } -> TokenType.DECORATOR
                    parent?.kind == "PROPERTY" && container?.kind != "CLASS_BODY" && container?.kind != "KT_FILE" && container?.kind != "SCRIPT" -> TokenType.VARIABLE
                    parent?.kind == "VALUE_PARAMETER" && parent.children.any { it.kind == "VAL_KEYWORD" || it.kind == "VAR_KEYWORD" } -> TokenType.PROPERTY
                    parent?.kind == "FUN" && container?.kind == "CLASS_BODY" -> TokenType.METHOD
                    parent?.kind == "LABEL" -> TokenType.LABEL
                    declared != null -> declared
                    parents.any { it.kind == "VALUE_ARGUMENT_NAME" } -> TokenType.PARAMETER
                    parents.any { it.kind == "PACKAGE_DIRECTIVE" || it.kind == "IMPORT_DIRECTIVE" } -> TokenType.NAMESPACE
                    parents.any { it.kind == "USER_TYPE" } -> if (parents.any { it.kind == "CONSTRUCTOR_CALLEE" } && parents.any { it.kind == "ANNOTATION_ENTRY" }) TokenType.DECORATOR else TokenType.TYPE
                    parents.getOrNull(parents.size - 2)?.kind == "CALL_EXPRESSION" -> TokenType.FUNCTION
                    else -> TokenType.VARIABLE
                }
            }
            parent?.kind == "OPERATION_REFERENCE" || kind in operatorKinds -> TokenType.OPERATOR
            else -> null
        }
        if (type != null) {
            if (declaration) modifiers = modifiers or TokenModifier.DECLARATION.mask
            if (size == data.size) data = data.copyOf(data.size * 2)
            data[size++] = node.start
            data[size++] = node.end
            data[size++] = type.ordinal
            data[size++] = modifiers
        }
    }
    visit(this@classificationData)
    return data.copyOf(size)
}

private val commentKinds = setOf("EOL_COMMENT", "BLOCK_COMMENT", "DOC_COMMENT", "SHEBANG_COMMENT")
private val stringKinds = setOf("OPEN_QUOTE", "CLOSING_QUOTE", "REGULAR_STRING_PART", "ESCAPE_SEQUENCE", "CHARACTER_LITERAL")
private val keywordKinds = setOf("AS_SAFE", "NOT_IN", "NOT_IS")
private val operatorKinds = setOf("EQ", "ARROW", "COLONCOLON", "SAFE_ACCESS")
private val declarationKinds = mapOf("CLASS" to TokenType.CLASS, "OBJECT_DECLARATION" to TokenType.CLASS, "TYPEALIAS" to TokenType.TYPE, "FUN" to TokenType.FUNCTION,
    "PROPERTY" to TokenType.PROPERTY, "VALUE_PARAMETER" to TokenType.PARAMETER, "TYPE_PARAMETER" to TokenType.TYPE_PARAMETER, "ENUM_ENTRY" to TokenType.ENUM_MEMBER)

private val scopeKinds = setOf("KT_FILE", "SCRIPT", "CLASS_BODY", "BLOCK", "FUN", "FUNCTION_LITERAL", "PROPERTY_INITIALIZER")
