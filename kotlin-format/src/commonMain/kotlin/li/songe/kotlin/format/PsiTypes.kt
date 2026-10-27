package li.songe.kotlin.format.psi

import li.songe.kotlin.tree.SyntaxNode

open class KtTypeElement(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p)
class KtTypeReference(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) { val typeElement get() = child<KtTypeElement>() }
class KtNullableType(n: SyntaxNode, s: String, p: PsiElement?) : KtTypeElement(n, s, p) { val innerType get() = child<KtTypeElement>() }
class KtDynamicType(n: SyntaxNode, s: String, p: PsiElement?) : KtTypeElement(n, s, p)
class KtUserType(n: SyntaxNode, s: String, p: PsiElement?) : KtTypeElement(n, s, p) {
    val qualifier get() = child<KtUserType>()
    val referenceExpression get() = child<KtSimpleNameExpression>()
    val typeArgumentList get() = child<KtTypeArgumentList>()
}
class KtIntersectionType(n: SyntaxNode, s: String, p: PsiElement?) : KtTypeElement(n, s, p) {
    fun getLeftTypeRef() = childrenOf<KtTypeReference>().firstOrNull()
    fun getRightTypeRef() = childrenOf<KtTypeReference>().getOrNull(1)
}
class KtFunctionType(n: SyntaxNode, s: String, p: PsiElement?) : KtTypeElement(n, s, p) {
    val contextReceiverList get() = child<KtContextReceiverList>()
    val receiver get() = token("FUNCTION_TYPE_RECEIVER")?.child<KtTypeReference>()
    val parameterList get() = child<KtParameterList>()
    val returnTypeReference get() = child<KtTypeReference>()
}
enum class KtProjectionKind { IN, OUT, STAR, NONE }
class KtTypeProjection(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val typeReference get() = child<KtTypeReference>()
    val projectionKind get() = when {
        token("MUL") != null -> KtProjectionKind.STAR
        child<KtModifierList>()?.token("IN_KEYWORD") != null -> KtProjectionKind.IN
        child<KtModifierList>()?.token("OUT_KEYWORD") != null -> KtProjectionKind.OUT
        else -> KtProjectionKind.NONE
    }
}
class KtTypeArgumentList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val arguments get() = childrenOf<KtTypeProjection>()
    val trailingComma get() = trailingCommaOf(this)
}
class KtTypeParameter(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) { val extendsBound get() = child<KtTypeReference>() }
class KtTypeParameterList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val parameters get() = childrenOf<KtTypeParameter>()
    val trailingComma get() = trailingCommaOf(this)
}
class KtTypeConstraint(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val subjectTypeParameterName get() = child<KtSimpleNameExpression>()
    val boundTypeReference get() = child<KtTypeReference>()
}
class KtTypeConstraintList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) { val constraints get() = childrenOf<KtTypeConstraint>() }
class KtTypeAlias(n: SyntaxNode, s: String, p: PsiElement?) : KtDeclaration(n, s, p) { fun getTypeReference() = child<KtTypeReference>() }
class KtSuperTypeList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) { val entries get() = childrenOf<KtElement>() }
class KtSuperTypeCallEntry(n: SyntaxNode, s: String, p: PsiElement?) : KtCallElement(n, s, p) { val typeReference get() = child<KtTypeReference>() ?: token("CONSTRUCTOR_CALLEE")?.child<KtTypeReference>() }
class KtDelegatedSuperTypeEntry(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val typeReference get() = child<KtTypeReference>()
    val delegateExpression get() = child<KtExpression>()
}
class KtModifierList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p)
class KtContextReceiverList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) { fun contextReceivers() = childrenOf<KtElement>(); val typeReferences get() = childrenOf<KtTypeReference>() }
class KtAnnotation(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val entries get() = childrenOf<KtAnnotationEntry>()
    val useSiteTarget get() = child<KtAnnotationUseSiteTarget>()
}
class KtAnnotationEntry(n: SyntaxNode, s: String, p: PsiElement?) : KtCallElement(n, s, p) {
    val atSymbol get() = token("AT")
    val useSiteTarget get() = child<KtAnnotationUseSiteTarget>()
    val typeReference get() = token("CONSTRUCTOR_CALLEE")?.child<KtTypeReference>()
}
class KtAnnotationUseSiteTarget(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    data class Target(val renderName: String)
    fun getAnnotationUseSiteTarget() = Target(text.removeSuffix(":"))
}
class KtFileAnnotationList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p)
class KtAnnotatedExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p) { val baseExpression get() = childrenOf<KtExpression>().firstOrNull { it !is KtAnnotationEntry } }
class KtPackageDirective(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val packageKeyword get() = token("PACKAGE_KEYWORD")
    val packageNames get() = collectNames(this)
}
private fun collectNames(e: PsiElement): List<KtSimpleNameExpression> = if (e is KtSimpleNameExpression) listOf(e) else e.allChildren.flatMap(::collectNames)
class KtImportList(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) { val imports get() = childrenOf<KtImportDirective>() }
class KtImportDirective(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) {
    val importedReference get() = child<KtExpression>()
    val alias get() = child<KtImportAlias>()
    val isAllUnder get() = token("MUL") != null
}
class KtImportAlias(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p) { val nameIdentifier get() = token("IDENTIFIER") }
class KtConstantExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p)
class KtStringTemplateExpression(n: SyntaxNode, s: String, p: PsiElement?) : KtExpression(n, s, p)
class KtContainerNode(n: SyntaxNode, s: String, p: PsiElement?) : KtElement(n, s, p)
