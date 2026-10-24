package li.songe.kotlin.tree

/** A lossless, immutable syntax node. All offsets are UTF-16 code units. */
data class SyntaxNode(
    val kind: String,
    val start: Int,
    val end: Int,
    val children: List<SyntaxNode> = emptyList(),
    val error: String? = null,
) {
    init { require(start >= 0 && end >= start) }
}
