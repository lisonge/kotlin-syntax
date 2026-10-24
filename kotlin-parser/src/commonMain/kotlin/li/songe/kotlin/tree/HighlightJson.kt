package li.songe.kotlin.tree

/** Compact highlighting wire format: repeating UTF-16 start, end, token type, modifier bits.
 * Token IDs match the VS Code legend; parsing and syntax tree construction are unchanged.
 */
fun SyntaxNode.highlightJson(): String = buildString {
    append('[')
    var first = true
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
        var modifiers = if (kind == "DOC_COMMENT") 16 else 0
        val type = when {
            kind in commentKinds -> 11
            kind in stringKinds -> 12
            kind == "INTEGER_LITERAL" || kind == "FLOAT_LITERAL" -> 13
            kind.endsWith("_KEYWORD") || kind in keywordKinds -> 10
            kind == "IDENTIFIER" -> {
                val declared = declarationKinds[parent?.kind]
                declaration = declared != null
                // Only inspect the declaration itself: nested modifiers belong to other symbols.
                if (declared != null && parent != null) {
                    if (parent.children.any { it.kind == "VAL_KEYWORD" }) modifiers = modifiers or 2
                    val flags = parent.children.firstOrNull { it.kind == "MODIFIER_LIST" }?.children.orEmpty()
                    if (flags.any { it.kind == "ABSTRACT_KEYWORD" }) modifiers = modifiers or 4
                    if (flags.any { it.kind == "SUSPEND_KEYWORD" }) modifiers = modifiers or 8
                }
                val container = parents.dropLast(1).withIndex().lastOrNull { (i, n) -> n.kind in scopeKinds && !(n.kind == "BLOCK" && parents.getOrNull(i - 1)?.kind == "SCRIPT") }?.value
                val flags = parent?.children?.firstOrNull { it.kind == "MODIFIER_LIST" }?.children.orEmpty()
                when {
                    parent?.kind == "CLASS" && parent.children.any { it.kind == "INTERFACE_KEYWORD" } -> 3
                    parent?.kind == "CLASS" && flags.any { it.kind == "ENUM_KEYWORD" } -> 16
                    parent?.kind == "CLASS" && flags.any { it.kind == "ANNOTATION_KEYWORD" } -> 15
                    parent?.kind == "PROPERTY" && container?.kind != "CLASS_BODY" && container?.kind != "KT_FILE" && container?.kind != "SCRIPT" -> 7
                    parent?.kind == "VALUE_PARAMETER" && parent.children.any { it.kind == "VAL_KEYWORD" || it.kind == "VAR_KEYWORD" } -> 8
                    parent?.kind == "FUN" && container?.kind == "CLASS_BODY" -> 17
                    parent?.kind == "LABEL" -> 18
                    declared != null -> declared
                    parents.any { it.kind == "PACKAGE_DIRECTIVE" || it.kind == "IMPORT_DIRECTIVE" } -> 0
                    parents.any { it.kind == "USER_TYPE" } -> if (parents.any { it.kind == "CONSTRUCTOR_CALLEE" }) 15 else 1
                    parents.getOrNull(parents.size - 2)?.kind == "CALL_EXPRESSION" -> 9
                    else -> 7
                }
            }
            parent?.kind == "OPERATION_REFERENCE" || kind in operatorKinds -> 14
            else -> -1
        }
        if (type >= 0) {
            if (!first) append(',')
            first = false
            append(node.start); append(','); append(node.end); append(','); append(type); append(','); append(modifiers or if (declaration) 1 else 0)
        }
    }
    visit(this@highlightJson)
    append(']')
}
private val commentKinds = setOf("EOL_COMMENT", "BLOCK_COMMENT", "DOC_COMMENT", "SHEBANG_COMMENT")
private val stringKinds = setOf("OPEN_QUOTE", "CLOSING_QUOTE", "REGULAR_STRING_PART", "ESCAPE_SEQUENCE", "CHARACTER_LITERAL")
private val keywordKinds = setOf("AS_SAFE", "NOT_IN", "NOT_IS")
private val operatorKinds = setOf("EQ", "ARROW", "COLONCOLON", "SAFE_ACCESS")
private val declarationKinds = mapOf("CLASS" to 2, "OBJECT_DECLARATION" to 2, "TYPEALIAS" to 1, "FUN" to 9,
    "PROPERTY" to 8, "VALUE_PARAMETER" to 6, "TYPE_PARAMETER" to 5, "ENUM_ENTRY" to 4)

private val scopeKinds = setOf("KT_FILE", "SCRIPT", "CLASS_BODY", "BLOCK", "FUN", "FUNCTION_LITERAL", "PROPERTY_INITIALIZER")
