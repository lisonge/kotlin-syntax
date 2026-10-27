package li.songe.kotlin.format.psi

import li.songe.kotlin.tree.SyntaxNode

/** A per-format view of the portable tree. Source offsets remain UTF-16. */
open class PsiElement(val syntax: SyntaxNode, val source: String, val parent: PsiElement?) {
    val kind get() = syntax.kind
    val text get() = source.substring(syntax.start, syntax.end)
    val textLength get() = syntax.end - syntax.start
    val startOffset get() = syntax.start
    val endOffset get() = syntax.end
    val allChildren: List<PsiElement> by lazy { syntax.children.map { wrap(it, source, this) } }
    val children: Array<PsiElement> get() = allChildren.filter { it is KtElement && it !is PsiComment }.toTypedArray()
    val firstChild get() = allChildren.firstOrNull()
    val lastChild get() = allChildren.lastOrNull()
    val nextSibling get() = parent?.allChildren?.let { it.getOrNull(it.indexOf(this) + 1) }
    val prevSibling get() = parent?.allChildren?.let { it.getOrNull(it.indexOf(this) - 1) }
    val node get() = AstNode(this)
    val containingFile: KtFile get() = (parent?.containingFile ?: this) as KtFile
    val textRange get() = TextRange(startOffset, endOffset)
    fun textContains(c: Char) = text.contains(c)
    inline fun <reified T : PsiElement> child(): T? = allChildren.filterIsInstance<T>().firstOrNull()
    inline fun <reified T : PsiElement> childrenOf(): List<T> = allChildren.filterIsInstance<T>()
    fun token(kind: String): PsiElement? = allChildren.firstOrNull { it.kind == kind }
    fun nested(kind: String): KtExpression? = token(kind)?.child<KtExpression>()
    fun getStubOrPsiChild(kind: KtToken): PsiElement? = token(kind.name)
    open fun accept(visitor: KtTreeVisitorVoid) { visitor.dispatch(this) }
    fun acceptChildren(visitor: KtTreeVisitorVoid) { allChildren.forEach { it.accept(visitor) } }
}
data class TextRange(val startOffset: Int, val endOffset: Int) { val length get() = endOffset - startOffset }
class AstNode(val psi: PsiElement) {
    val elementType get() = if (psi.parent is KtModifierList && psi.kind.endsWith("_KEYWORD")) KtModifierKeywordToken(psi.kind, psi.text) else KtToken(psi.kind)
    val text get() = psi.text
    val treeParent get() = psi.parent?.node
    fun children() = psi.allChildren.map { it.node }
    fun textContains(c: Char) = psi.textContains(c)
    fun findChildByType(type: KtToken) = psi.token(type.name)?.node
}
open class KtElement(n: SyntaxNode, s: String, p: PsiElement?) : PsiElement(n, s, p)
open class KtExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p)
open class KtDeclaration(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val modifierList get() = child<KtModifierList>()
    val nameIdentifier get() = token("IDENTIFIER")
    val name get() = nameIdentifier?.text?.removeSurrounding("`")
    val typeParameterList get() = child<KtTypeParameterList>()
    val typeConstraintList get() = child<KtTypeConstraintList>()
    fun hasModifier(token: KtToken) = modifierList?.allChildren?.any { it.kind == token.name } == true
}
class PsiWhiteSpace(n: SyntaxNode, s: String, p: PsiElement?) : PsiElement(n, s, p)
class PsiComment(n: SyntaxNode, s: String, p: PsiElement?) : PsiElement(n, s, p)
class LeafPsiElement(n: SyntaxNode, s: String, p: PsiElement?) : PsiElement(n, s, p) { val elementType get() = KtToken(kind) }
class KtFile(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val importList get() = child<KtImportList>()
}
class KtScript(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) { val blockExpression get() = child<KtBlockExpression>()!! }
class KtScriptInitializer(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p)
open class KtReferenceExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p)
open class KtSimpleNameExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtReferenceExpression(n, s, p) {
    fun getIdentifier() = token("IDENTIFIER") ?: token("LABEL")?.token("IDENTIFIER")
    fun getReferencedName() = text.removeSurrounding("`")
}
class KtLabelReferenceExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtSimpleNameExpression(n, s, p)
open class KtFunction(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) {
    val valueParameterList get() = child<KtParameterList>()
    val bodyExpression get() = childrenOf<KtExpression>().lastOrNull { it !is KtDeclaration && it !is KtConstructorDelegationCall }
    val bodyBlockExpression get() = bodyExpression as? KtBlockExpression
    val receiverTypeReference get() = childrenOf<KtTypeReference>().firstOrNull { it.endOffset < (token("LPAR")?.startOffset ?: valueParameterList?.startOffset ?: endOffset) && token("DOT") != null }
    val typeReference get() = childrenOf<KtTypeReference>().lastOrNull { it != receiverTypeReference }
    fun hasBlockBody() = bodyExpression is KtBlockExpression
    fun hasBody() = bodyExpression != null
}
class KtNamedFunction(n: SyntaxNode, s: String, p: PsiElement?) : KtFunction(n, s, p)
class KtPrimaryConstructor(n: SyntaxNode, s: String, p: PsiElement?) : KtFunction(n, s, p) {
    fun hasConstructorKeyword() = token("CONSTRUCTOR_KEYWORD") != null
}
class KtSecondaryConstructor(n: SyntaxNode, s: String, p: PsiElement?) : KtFunction(n, s, p) {
    fun getDelegationCall() = child<KtConstructorDelegationCall>()!!
}
class KtFunctionLiteral(n: SyntaxNode, s: String, p: PsiElement?) : KtFunction(n, s, p) {
    val lBrace get() = token("LBRACE")!!
    val rBrace get() = token("RBRACE")!!
    val arrow get() = token("ARROW")
}
class KtProperty(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) {
    val valOrVarKeyword get() = token("VAL_KEYWORD") ?: token("VAR_KEYWORD")!!
    val isVar get() = token("VAR_KEYWORD") != null
    val receiverTypeReference get() = childrenOf<KtTypeReference>().firstOrNull { it.endOffset < (nameIdentifier?.startOffset ?: 0) }
    val typeReference get() = childrenOf<KtTypeReference>().firstOrNull { it != receiverTypeReference }
    val initializer get() = childrenOf<KtExpression>().firstOrNull { it.startOffset >= (token("EQ")?.endOffset ?: Int.MAX_VALUE) }
    val delegate get() = child<KtPropertyDelegate>()
    val accessors get() = childrenOf<KtPropertyAccessor>()
    val backingField get() = child<KtBackingField>()
    val fieldDeclaration get() = backingField
    val getter get() = accessors.firstOrNull { it.isGetter }
    val setter get() = accessors.firstOrNull { !it.isGetter }
    fun hasDelegate() = delegate != null
}
class KtPropertyDelegate(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) { val expression get() = child<KtExpression>() }
class KtPropertyAccessor(n: SyntaxNode, s: String, p: PsiElement?) : KtFunction(n, s, p) {
    val namePlaceholder get() = token("GET_KEYWORD") ?: token("SET_KEYWORD")!!
    val parameterList get() = valueParameterList
    val isGetter get() = token("GET_KEYWORD") != null
    val parameter get() = valueParameterList?.parameters?.singleOrNull()
    val returnTypeReference get() = typeReference
}
class KtBackingField(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) {
    val namePlaceholder get() = token("FIELD_KEYWORD") ?: token("IDENTIFIER")!!
    val returnTypeReference get() = typeReference
    val typeReference get() = child<KtTypeReference>()
    val initializer get() = child<KtExpression>()
}
open class KtClassOrObject(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) {
    val primaryConstructor get() = child<KtPrimaryConstructor>()
    val body get() = child<KtClassBody>()
    fun getDeclarationKeyword() = token("CLASS_KEYWORD") ?: token("INTERFACE_KEYWORD") ?: token("OBJECT_KEYWORD")
    fun getSuperTypeList() = child<KtSuperTypeList>()
}
open class KtClass(n: SyntaxNode, s: String, p: PsiElement?) : KtClassOrObject(n, s, p) {
    fun isInterface() = token("INTERFACE_KEYWORD") != null
    fun isEnum() = hasModifier(KtToken("ENUM_KEYWORD"))
    fun isAnnotation() = hasModifier(KtToken("ANNOTATION_KEYWORD"))
}
class KtObjectDeclaration(n: SyntaxNode, s: String, p: PsiElement?) : KtClassOrObject(n, s, p) { fun isCompanion() = hasModifier(KtToken("COMPANION_KEYWORD")) }
class KtInitializerList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p)
class KtEnumEntry(n: SyntaxNode, s: String, p: PsiElement?) : KtClass(n, s, p) { val initializerList get() = childrenOf<KtInitializerList>().firstOrNull() }
class KtClassBody(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) { val declarations get() = childrenOf<KtDeclaration>() }
class KtClassInitializer(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) { val body get() = child<KtBlockExpression>() }
class KtBlockExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val statements get() = childrenOf<KtExpression>()
    val lBrace get() = token("LBRACE")
    val rBrace get() = token("RBRACE")
}
class KtLambdaExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val functionLiteral get() = child<KtFunctionLiteral>()!!
    val bodyExpression get() = functionLiteral.bodyBlockExpression
    val valueParameters get() = functionLiteral.valueParameterList?.parameters.orEmpty()
}
open class KtCallElement(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val valueArgumentList get() = child<KtValueArgumentList>()
    val typeArgumentList get() = child<KtTypeArgumentList>()
    val lambdaArguments get() = childrenOf<KtLambdaArgument>()
    val calleeExpression get() = childrenOf<KtExpression>().firstOrNull { it !is KtLambdaExpression }
}
class KtCallExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtCallElement(n, s, p)
class KtConstructorCalleeExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p)
class KtObjectLiteralExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p)
class KtConstructorDelegationCall(n: SyntaxNode, s: String, p: PsiElement?) : KtCallElement(n, s, p) {
    val isImplicit get() = text.isEmpty()
    val isCallToThis get() = text.trimStart().startsWith("this")
}
open class KtValueArgument(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    fun getArgumentExpression() = child<KtExpression>()
    fun getArgumentName() = child<KtValueArgumentName>()
    val isSpread get() = token("MUL") != null
}
class KtLambdaArgument(n: SyntaxNode, s: String, p: PsiElement?) : KtValueArgument(n, s, p) { fun getLambdaExpression() = getArgumentExpression() as? KtLambdaExpression }
class KtValueArgumentName(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p)
class KtValueArgumentList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val arguments get() = childrenOf<KtValueArgument>()
    val leftParenthesis get() = token("LPAR")
    val rightParenthesis get() = token("RPAR")
    val trailingComma get() = trailingCommaOf(this)
}
class KtParameterList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val parameters get() = childrenOf<KtParameter>()
    val leftParenthesis get() = token("LPAR")
    val rightParenthesis get() = token("RPAR")
    val trailingComma get() = trailingCommaOf(this)
}
class KtParameter(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) {
    val typeReference get() = child<KtTypeReference>()
    val defaultValue get() = child<KtExpression>()
    val valOrVarKeyword get() = token("VAL_KEYWORD") ?: token("VAR_KEYWORD")
    val destructuringDeclaration get() = child<KtDestructuringDeclaration>()
    fun hasValOrVar() = valOrVarKeyword != null
}
class KtDestructuringDeclaration(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) {
    val lPar get() = token("LPAR") ?: token("LBRACKET")
    val rPar get() = token("RPAR") ?: token("RBRACKET")
    val entries get() = childrenOf<KtDestructuringDeclarationEntry>()
    val initializer get() = childrenOf<KtExpression>().lastOrNull { it !is KtDestructuringDeclarationEntry }
    val valOrVarKeyword get() = token("VAL_KEYWORD") ?: token("VAR_KEYWORD")
    val trailingComma get() = rPar?.getPrevSiblingIgnoringWhitespaceAndComments()?.takeIf { it.kind == "COMMA" }
}
class KtDestructuringDeclarationEntry(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) {
    val initializer get() = child<KtExpression>()
    val typeReference get() = child<KtTypeReference>()
    val ownValOrVarKeywordText get() = (token("VAL_KEYWORD") ?: token("VAR_KEYWORD"))?.text
}
open class KtQualifiedExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val receiverExpression get() = childrenOf<KtExpression>().first()
    val selectorExpression get() = childrenOf<KtExpression>().getOrNull(1)
    val operationSign get() = KtSingleValueToken(if (kind == "SAFE_ACCESS_EXPRESSION") "SAFE_ACCESS" else "DOT", if (kind == "SAFE_ACCESS_EXPRESSION") "?." else ".")
    val operationTokenNode get() = (token("DOT") ?: token("SAFE_ACCESS"))!!.node
}
class KtDotQualifiedExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtQualifiedExpression(n, s, p)
class KtBinaryExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val left get() = childrenOf<KtExpression>().firstOrNull { it.kind != "OPERATION_REFERENCE" }
    val right get() = childrenOf<KtExpression>().lastOrNull { it.kind != "OPERATION_REFERENCE" && it != left }
    val operationReference get() = token("OPERATION_REFERENCE")!!
    val operationToken get() = KtToken(operationReference.firstChild?.kind ?: operationReference.kind)
}
class KtBinaryExpressionWithTypeRHS(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val left get() = child<KtExpression>()!!
    val right get() = child<KtTypeReference>()
    val operationReference get() = token("OPERATION_REFERENCE")!!
}
open class KtUnaryExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val baseExpression get() = childrenOf<KtExpression>().firstOrNull { it.kind != "OPERATION_REFERENCE" }
    val operationReference get() = token("OPERATION_REFERENCE")!!
}
class KtPrefixExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtUnaryExpression(n, s, p)
class KtPostfixExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtUnaryExpression(n, s, p)
class KtLabeledExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val baseExpression get() = childrenOf<KtExpression>().lastOrNull { it !is KtLabelReferenceExpression }
    val labelQualifier get() = child<KtLabelReferenceExpression>()
}
class KtParenthesizedExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) { val expression get() = child<KtExpression>() }
class KtArrayAccessExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtReferenceExpression(n, s, p) {
    val arrayExpression get() = child<KtExpression>()
    val indexExpressions get() = token("INDICES")?.childrenOf<KtExpression>().orEmpty()
    val trailingComma get() = token("INDICES")?.let(::trailingCommaOf)
}
class KtCallableReferenceExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val receiverExpression get() = childrenOf<KtExpression>().firstOrNull { it.endOffset <= (token("COLONCOLON")?.startOffset ?: 0) }
    val callableReference get() = childrenOf<KtSimpleNameExpression>().last()
    val hasQuestionMarks get() = token("QUEST") != null
}
class KtClassLiteralExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) { val receiverExpression get() = child<KtExpression>() }
class KtCollectionLiteralExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    fun getInnerExpressions() = childrenOf<KtExpression>()
    val trailingComma get() = trailingCommaOf(this)
}
class KtIsExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val leftHandSide get() = child<KtExpression>()!!
    val operationReference get() = token("OPERATION_REFERENCE")!!
    val typeReference get() = child<KtTypeReference>()
}
open class KtExpressionWithLabel(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val labelQualifier get() = child<KtLabelReferenceExpression>()
    fun getTargetLabel() = labelQualifier
}
class KtThisExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpressionWithLabel(n, s, p)
class KtSuperExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpressionWithLabel(n, s, p) { val superTypeQualifier get() = child<KtTypeReference>() }
class KtReturnExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpressionWithLabel(n, s, p) { val returnedExpression get() = childrenOf<KtExpression>().lastOrNull { it !is KtLabelReferenceExpression } }
class KtBreakExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpressionWithLabel(n, s, p)
class KtContinueExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpressionWithLabel(n, s, p)
class KtThrowExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) { val thrownExpression get() = child<KtExpression>() }
class KtIfExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val condition get() = nested("CONDITION")
    val then get() = nested("THEN")
    val `else` get() = nested("ELSE")
    val elseKeyword get() = token("ELSE_KEYWORD")
}
open class KtLoopExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val condition get() = nested("CONDITION")
    val body get() = nested("BODY")
}
class KtWhileExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtLoopExpression(n, s, p)
class KtDoWhileExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtLoopExpression(n, s, p)
class KtForExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtLoopExpression(n, s, p) {
    val loopParameter get() = child<KtParameter>()
    val loopRange get() = nested("LOOP_RANGE")
}
class KtTryExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val tryBlock get() = child<KtBlockExpression>()!!
    val catchClauses get() = childrenOf<KtCatchClause>()
    val finallyBlock get() = child<KtFinallySection>()
}
class KtCatchClause(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val catchParameter get() = child<KtParameterList>()?.parameters?.firstOrNull()
    val catchBody get() = child<KtBlockExpression>()
}
class KtFinallySection(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) { val finalExpression get() = child<KtBlockExpression>()!! }
class KtWhenExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) {
    val subjectExpression get() = child<KtExpression>()
    val entries get() = childrenOf<KtWhenEntry>()
}
class KtWhenEntry(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val elseKeyword get() = token("ELSE_KEYWORD")
    val conditions get() = childrenOf<KtWhenCondition>()
    val expression get() = child<KtExpression>()
    val guard get() = child<KtWhenEntryGuard>()
    val trailingComma get() = allChildren.takeWhile { it.kind != "ARROW" }.lastOrNull { it.kind != "WHITE_SPACE" }?.takeIf { it.kind == "COMMA" }
}
open class KtWhenCondition(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p)
class KtWhenEntryGuard(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) { fun getExpression() = child<KtExpression>() }
class KtWhenConditionWithExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtWhenCondition(n, s, p) { val expression get() = child<KtExpression>() }
class KtWhenConditionInRange(n: SyntaxNode, s: String, p: PsiElement?) : KtWhenCondition(n, s, p) {
    val rangeExpression get() = childrenOf<KtExpression>().firstOrNull { it.kind != "OPERATION_REFERENCE" }
    val isNegated get() = text.trimStart().startsWith("!")
}
class KtWhenConditionIsPattern(n: SyntaxNode, s: String, p: PsiElement?) : KtWhenCondition(n, s, p) {
    val typeReference get() = child<KtTypeReference>()
    val isNegated get() = text.trimStart().startsWith("!")
}
fun trailingCommaOf(e: PsiElement): PsiElement? {
    val significant = e.allChildren.filter { it !is PsiWhiteSpace && it !is PsiComment }
    val last = significant.lastOrNull()
    return (if (last?.kind in setOf("RPAR", "RBRACKET", "GT")) significant.dropLast(1).lastOrNull() else last)?.takeIf { it.kind == "COMMA" }
}
fun PsiElement.getNextSiblingIgnoringWhitespace(): PsiElement? = generateSequence(nextSibling) { it.nextSibling }.firstOrNull { it !is PsiWhiteSpace }
fun PsiElement.getPrevSiblingIgnoringWhitespace(): PsiElement? = generateSequence(prevSibling) { it.prevSibling }.firstOrNull { it !is PsiWhiteSpace }
open class KtToken(val name: String) {
    override fun equals(other: Any?) = other is KtToken && name == other.name
    override fun hashCode() = name.hashCode()
}
open class KtSingleValueToken(name: String, val value: String) : KtToken(name)
class KtModifierKeywordToken(name: String, value: String) : KtSingleValueToken(name, value)
typealias Void = Nothing
val CONTEXT_PARAMETER_LIST = KtToken("CONTEXT_PARAMETER_LIST")
fun PsiElement.children(): Sequence<PsiElement> = allChildren.asSequence()
fun PsiElement.startsWithComment(): Boolean = allChildren.firstOrNull { it !is PsiWhiteSpace } is PsiComment
fun PsiElement?.getPrevSiblingIgnoringWhitespaceAndComments(withItself: Boolean = false): PsiElement? =
    generateSequence(if (withItself) this else this?.prevSibling) { it.prevSibling }.firstOrNull { it !is PsiWhiteSpace && it !is PsiComment }
fun KtContextReceiverList.listToVisit(): List<KtElement> = childrenOf<KtElement>()
fun PsiElement?.getNextSiblingIgnoringWhitespaceAndComments(): PsiElement? = generateSequence(this?.nextSibling) { it.nextSibling }.firstOrNull { it !is PsiWhiteSpace && it !is PsiComment }
inline fun <reified T : PsiElement> PsiElement.getParentOfType(strict: Boolean = true): T? = generateSequence(if (strict) parent else this) { it.parent }.filterIsInstance<T>().firstOrNull()
fun PsiElement.prevLeaf(skipEmpty: Boolean): PsiElement? {
    var current = this
    while (current.prevSibling == null) current = current.parent ?: return null
    current = current.prevSibling!!
    while (current.lastChild != null) current = current.lastChild!!
    return if (skipEmpty && current.text.isEmpty()) current.prevLeaf(true) else current
}
typealias KtContainerNodeForControlStructureBody = KtContainerNode
class KtStringTemplateEntry(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p)
