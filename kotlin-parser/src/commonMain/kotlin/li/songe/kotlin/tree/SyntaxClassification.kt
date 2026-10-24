package li.songe.kotlin.tree

/** Syntax classifications. Entry order is the stable compact WASM token ID. */
enum class TokenType(val wireName: String) {
    NAMESPACE("namespace"),
    TYPE("type"),
    CLASS("class"),
    INTERFACE("interface"),
    ENUM_MEMBER("enumMember"),
    TYPE_PARAMETER("typeParameter"),
    PARAMETER("parameter"),
    VARIABLE("variable"),
    PROPERTY("property"),
    FUNCTION("function"),
    KEYWORD("keyword"),
    COMMENT("comment"),
    STRING("string"),
    NUMBER("number"),
    OPERATOR("operator"),
    DECORATOR("decorator"),
    ENUM("enum"),
    METHOD("method"),
    LABEL("label")
}

/** Syntactic modifiers; these do not imply symbol resolution. */
enum class TokenModifier(val wireName: String) {
    DECLARATION("declaration"),
    READONLY("readonly"),
    ABSTRACT("abstract"),
    ASYNC("async"),
    DOCUMENTATION("documentation");

    val mask: Int get() = 1 shl ordinal
}

/** A nonempty range in UTF-16 code units, with an exclusive [end]. Colors belong to the UI. */
data class SyntaxClassification(
    val start: Int,
    val end: Int,
    val type: TokenType,
    val modifiers: Set<TokenModifier> = emptySet(),
)
