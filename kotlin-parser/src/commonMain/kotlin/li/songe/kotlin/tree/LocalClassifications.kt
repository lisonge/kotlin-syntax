package li.songe.kotlin.tree

/** Overlay same-file declarations and scoped type-use evidence without loading dependencies. */
internal fun SyntaxNode.localClassificationData(source: String, index: DefinitionIndex): IntArray {
    val data = classificationData()
    val spans = mutableMapOf<Int, Int>()
    val declarations = mutableMapOf<Int, Int>()
    val bindings = mutableMapOf<Int, Int?>()
    val fallbackReceivers = mutableListOf<Int>()
    for (i in data.indices step 4) {
        spans[data[i]] = i
        if (data[i + 3] and TokenModifier.DECLARATION.mask != 0) declarations[data[i]] = i
    }
    fun apply(offset: Int, target: Int) {
        val from = declarations[target] ?: return
        val to = spans[offset] ?: return
        if (data[to + 3] and TokenModifier.DECLARATION.mask != 0) return
        if (data[to + 2] == TokenType.DECORATOR.ordinal) return
        data[to + 2] = data[from + 2]
        data[to + 3] = data[from + 3] and TokenModifier.DECLARATION.mask.inv()
    }
    for (i in data.indices step 4) {
        if (data[i + 3] and TokenModifier.DECLARATION.mask != 0) continue
        if (data[i + 2] !in localReferenceTypes) continue
        val targets = index.definitionsAt(data[i])
        val target = targets.singleOrNull()?.nameStart
        bindings[data[i]] = target
        if (target == null) continue
        if (target !in declarations) continue
        apply(data[i], target)
    }
    LocalTypeAnalysis(this, source, index, bindings, ::apply) { token ->
        val name = source.substring(token.start, token.end).removeSurrounding("`")
        if (name.firstOrNull()?.isUpperCase() == true && !name.all { it.isUpperCase() || it.isDigit() || it == '_' }) {
            fallbackReceivers.add(token.start)
        }
    }.run()
    for (offset in index.typeEvidenceReferences()) {
        val span = spans[offset] ?: continue
        if (data[span + 2] in localReferenceTypes && data[span + 3] and TokenModifier.DECLARATION.mask == 0) {
            data[span + 2] = TokenType.TYPE.ordinal
        }
    }
    // Naming is a presentation fallback only, after all single-file semantic evidence.
    for (offset in fallbackReceivers) {
        val span = spans[offset] ?: continue
        if (data[span + 2] == TokenType.VARIABLE.ordinal && bindings[offset] !in declarations &&
            data[span + 3] and TokenModifier.DECLARATION.mask == 0) data[span + 2] = TokenType.CLASS.ordinal
    }
    return data
}

private val localReferenceTypes = setOf(TokenType.VARIABLE.ordinal, TokenType.FUNCTION.ordinal, TokenType.TYPE.ordinal)
