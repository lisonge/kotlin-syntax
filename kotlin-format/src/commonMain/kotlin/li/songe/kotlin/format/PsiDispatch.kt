package li.songe.kotlin.format.psi
import li.songe.kotlin.tree.SyntaxNode

internal fun wrap(n: SyntaxNode, s: String, p: PsiElement?): PsiElement = when(n.kind) {
"CONSTRUCTOR_CALLEE" -> KtConstructorCalleeExpression(n,s,p)
"OBJECT_LITERAL" -> KtObjectLiteralExpression(n,s,p)
"KT_FILE" -> KtFile(n,s,p)
"SCRIPT" -> KtScript(n,s,p)
"SCRIPT_INITIALIZER" -> KtScriptInitializer(n,s,p)
"ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION", "REFERENCE_EXPRESSION", "OPERATION_REFERENCE" -> KtSimpleNameExpression(n,s,p)
"LABEL_QUALIFIER" -> KtLabelReferenceExpression(n,s,p)
"FUN" -> KtNamedFunction(n,s,p)
"PRIMARY_CONSTRUCTOR" -> KtPrimaryConstructor(n,s,p)
"SECONDARY_CONSTRUCTOR" -> KtSecondaryConstructor(n,s,p)
"FUNCTION_LITERAL" -> KtFunctionLiteral(n,s,p)
"PROPERTY" -> KtProperty(n,s,p)
"PROPERTY_DELEGATE" -> KtPropertyDelegate(n,s,p)
"PROPERTY_ACCESSOR" -> KtPropertyAccessor(n,s,p)
"BACKING_FIELD" -> KtBackingField(n,s,p)
"CLASS_OR_OBJECT" -> KtClassOrObject(n,s,p)
"CLASS" -> KtClass(n,s,p)
"OBJECT_DECLARATION" -> KtObjectDeclaration(n,s,p)
"ENUM_ENTRY" -> KtEnumEntry(n,s,p)
"CLASS_BODY" -> KtClassBody(n,s,p)
"CLASS_INITIALIZER" -> KtClassInitializer(n,s,p)
"BLOCK" -> KtBlockExpression(n,s,p)
"LAMBDA_EXPRESSION" -> KtLambdaExpression(n,s,p)
"CALL_EXPRESSION" -> KtCallExpression(n,s,p)
"CONSTRUCTOR_DELEGATION_CALL" -> KtConstructorDelegationCall(n,s,p)
"VALUE_ARGUMENT" -> KtValueArgument(n,s,p)
"LAMBDA_ARGUMENT" -> KtLambdaArgument(n,s,p)
"VALUE_ARGUMENT_NAME" -> KtValueArgumentName(n,s,p)
"VALUE_ARGUMENT_LIST" -> KtValueArgumentList(n,s,p)
"VALUE_PARAMETER_LIST" -> KtParameterList(n,s,p)
"VALUE_PARAMETER" -> KtParameter(n,s,p)
"DESTRUCTURING_DECLARATION" -> KtDestructuringDeclaration(n,s,p)
"DESTRUCTURING_DECLARATION_ENTRY" -> KtDestructuringDeclarationEntry(n,s,p)
"DOT_QUALIFIED_EXPRESSION" -> KtDotQualifiedExpression(n,s,p)
"SAFE_ACCESS_EXPRESSION" -> KtQualifiedExpression(n,s,p)
"BINARY_EXPRESSION" -> KtBinaryExpression(n,s,p)
"BINARY_WITH_TYPE" -> KtBinaryExpressionWithTypeRHS(n,s,p)
"PREFIX_EXPRESSION" -> KtPrefixExpression(n,s,p)
"POSTFIX_EXPRESSION" -> KtPostfixExpression(n,s,p)
"LABELED_EXPRESSION" -> KtLabeledExpression(n,s,p)
"PARENTHESIZED" -> KtParenthesizedExpression(n,s,p)
"ARRAY_ACCESS_EXPRESSION" -> KtArrayAccessExpression(n,s,p)
"CALLABLE_REFERENCE_EXPRESSION" -> KtCallableReferenceExpression(n,s,p)
"CLASS_LITERAL_EXPRESSION" -> KtClassLiteralExpression(n,s,p)
"COLLECTION_LITERAL_EXPRESSION" -> KtCollectionLiteralExpression(n,s,p)
"IS_EXPRESSION" -> KtIsExpression(n,s,p)
"THIS_EXPRESSION" -> KtThisExpression(n,s,p)
"SUPER_EXPRESSION" -> KtSuperExpression(n,s,p)
"RETURN" -> KtReturnExpression(n,s,p)
"BREAK" -> KtBreakExpression(n,s,p)
"CONTINUE" -> KtContinueExpression(n,s,p)
"THROW" -> KtThrowExpression(n,s,p)
"IF" -> KtIfExpression(n,s,p)
"WHILE" -> KtWhileExpression(n,s,p)
"DO_WHILE" -> KtDoWhileExpression(n,s,p)
"FOR" -> KtForExpression(n,s,p)
"TRY" -> KtTryExpression(n,s,p)
"CATCH" -> KtCatchClause(n,s,p)
"FINALLY" -> KtFinallySection(n,s,p)
"WHEN" -> KtWhenExpression(n,s,p)
"WHEN_ENTRY" -> KtWhenEntry(n,s,p)
"WHEN_ENTRY_GUARD" -> KtWhenEntryGuard(n,s,p)
"WHEN_CONDITION_EXPRESSION" -> KtWhenConditionWithExpression(n,s,p)
"WHEN_CONDITION_IN_RANGE" -> KtWhenConditionInRange(n,s,p)
"WHEN_CONDITION_IS_PATTERN" -> KtWhenConditionIsPattern(n,s,p)
"TYPE_REFERENCE" -> KtTypeReference(n,s,p)
"NULLABLE_TYPE" -> KtNullableType(n,s,p)
"DYNAMIC_TYPE" -> KtDynamicType(n,s,p)
"USER_TYPE" -> KtUserType(n,s,p)
"INTERSECTION_TYPE" -> KtIntersectionType(n,s,p)
"FUNCTION_TYPE" -> KtFunctionType(n,s,p)
"TYPE_PROJECTION" -> KtTypeProjection(n,s,p)
"TYPE_ARGUMENT_LIST" -> KtTypeArgumentList(n,s,p)
"TYPE_PARAMETER" -> KtTypeParameter(n,s,p)
"TYPE_PARAMETER_LIST" -> KtTypeParameterList(n,s,p)
"TYPE_CONSTRAINT" -> KtTypeConstraint(n,s,p)
"TYPE_CONSTRAINT_LIST" -> KtTypeConstraintList(n,s,p)
"TYPEALIAS" -> KtTypeAlias(n,s,p)
"INITIALIZER_LIST" -> KtInitializerList(n,s,p)
"SUPER_TYPE_LIST" -> KtSuperTypeList(n,s,p)
"SUPER_TYPE_CALL_ENTRY" -> KtSuperTypeCallEntry(n,s,p)
"DELEGATED_SUPER_TYPE_ENTRY" -> KtDelegatedSuperTypeEntry(n,s,p)
"MODIFIER_LIST" -> KtModifierList(n,s,p)
"CONTEXT_RECEIVER_LIST", "CONTEXT_PARAMETER_LIST" -> KtContextReceiverList(n,s,p)
"ANNOTATION" -> KtAnnotation(n,s,p)
"ANNOTATION_ENTRY" -> KtAnnotationEntry(n,s,p)
"ANNOTATION_TARGET" -> KtAnnotationUseSiteTarget(n,s,p)
"FILE_ANNOTATION_LIST" -> KtFileAnnotationList(n,s,p)
"ANNOTATED_EXPRESSION" -> KtAnnotatedExpression(n,s,p)
"PACKAGE_DIRECTIVE" -> KtPackageDirective(n,s,p)
"IMPORT_LIST" -> KtImportList(n,s,p)
"IMPORT_DIRECTIVE" -> KtImportDirective(n,s,p)
"IMPORT_ALIAS" -> KtImportAlias(n,s,p)
"INTEGER_CONSTANT", "FLOAT_CONSTANT", "BOOLEAN_CONSTANT", "CHARACTER_CONSTANT", "NULL" -> KtConstantExpression(n,s,p)
"STRING_TEMPLATE" -> KtStringTemplateExpression(n,s,p)
"CONDITION", "THEN", "ELSE", "BODY", "LOOP_RANGE", "SUPER_TYPE_ENTRY", "CONTEXT_RECEIVER", "CONTEXT_PARAMETER", "INDICES", "FUNCTION_TYPE_RECEIVER" -> KtContainerNode(n,s,p)
"WHITE_SPACE" -> PsiWhiteSpace(n,s,p)
"EOL_COMMENT", "BLOCK_COMMENT", "DOC_COMMENT", "SHEBANG_COMMENT" -> PsiComment(n,s,p)
else -> if(n.children.isEmpty()) LeafPsiElement(n,s,p) else KtElement(n,s,p)
}

open class KtTreeVisitorVoid {
open fun visitElement(element: PsiElement) { element.acceptChildren(this) }
open fun visitKtFile(element: KtFile) { visitElement(element) }
open fun visitScript(element: KtScript) { visitElement(element) }
open fun visitNamedFunction(element: KtNamedFunction) { visitElement(element) }
open fun visitTypeReference(element: KtTypeReference) { visitElement(element) }
open fun visitDynamicType(element: KtDynamicType) { visitElement(element) }
open fun visitNullableType(element: KtNullableType) { visitElement(element) }
open fun visitUserType(element: KtUserType) { visitElement(element) }
open fun visitIntersectionType(element: KtIntersectionType) { visitElement(element) }
open fun visitTypeProjection(element: KtTypeProjection) { visitElement(element) }
open fun visitTypeArgumentList(element: KtTypeArgumentList) { visitElement(element) }
open fun visitTypeParameterList(element: KtTypeParameterList) { visitElement(element) }
open fun visitTypeParameter(element: KtTypeParameter) { visitElement(element) }
open fun visitTypeConstraintList(element: KtTypeConstraintList) { visitElement(element) }
open fun visitTypeConstraint(element: KtTypeConstraint) { visitElement(element) }
open fun visitFunctionType(element: KtFunctionType) { visitElement(element) }
open fun visitClassOrObject(element: KtClassOrObject) { visitElement(element) }
open fun visitProperty(element: KtProperty) { visitElement(element) }
open fun visitPrimaryConstructor(element: KtPrimaryConstructor) { visitElement(element) }
open fun visitSecondaryConstructor(element: KtSecondaryConstructor) { visitElement(element) }
open fun visitConstructorDelegationCall(element: KtConstructorDelegationCall) { visitElement(element) }
open fun visitClassInitializer(element: KtClassInitializer) { visitElement(element) }
open fun visitArgument(element: KtValueArgument) { visitElement(element) }
open fun visitSuperTypeList(element: KtSuperTypeList) { visitElement(element) }
open fun visitSuperTypeCallEntry(element: KtSuperTypeCallEntry) { visitElement(element) }
open fun visitDelegatedSuperTypeEntry(element: KtDelegatedSuperTypeEntry) { visitElement(element) }
open fun visitClassBody(element: KtClassBody) { visitElement(element) }
open fun visitValueArgumentList(element: KtValueArgumentList) { visitElement(element) }
open fun visitModifierList(element: KtModifierList) { visitElement(element) }
open fun visitContextReceiverList(element: KtContextReceiverList) { visitElement(element) }
open fun visitParameterList(element: KtParameterList) { visitElement(element) }
open fun visitParameter(element: KtParameter) { visitElement(element) }
open fun visitQualifiedExpression(element: KtQualifiedExpression) { visitElement(element) }
open fun visitCallExpression(element: KtCallExpression) { visitElement(element) }
open fun visitLambdaExpression(element: KtLambdaExpression) { visitElement(element) }
open fun visitThisExpression(element: KtThisExpression) { visitElement(element) }
open fun visitSimpleNameExpression(element: KtSimpleNameExpression) { visitElement(element) }
open fun visitReferenceExpression(element: KtReferenceExpression) { visitElement(element) }
open fun visitReturnExpression(element: KtReturnExpression) { visitElement(element) }
open fun visitBinaryExpression(element: KtBinaryExpression) { visitElement(element) }
open fun visitPostfixExpression(element: KtPostfixExpression) { visitElement(element) }
open fun visitPrefixExpression(element: KtPrefixExpression) { visitElement(element) }
open fun visitLabeledExpression(element: KtLabeledExpression) { visitElement(element) }
open fun visitConstantExpression(element: KtConstantExpression) { visitElement(element) }
open fun visitParenthesizedExpression(element: KtParenthesizedExpression) { visitElement(element) }
open fun visitWhenExpression(element: KtWhenExpression) { visitElement(element) }
open fun visitBlockExpression(element: KtBlockExpression) { visitElement(element) }
open fun visitWhenConditionWithExpression(element: KtWhenConditionWithExpression) { visitElement(element) }
open fun visitWhenConditionIsPattern(element: KtWhenConditionIsPattern) { visitElement(element) }
open fun visitWhenConditionInRange(element: KtWhenConditionInRange) { visitElement(element) }
open fun visitIfExpression(element: KtIfExpression) { visitElement(element) }
open fun visitArrayAccessExpression(element: KtArrayAccessExpression) { visitElement(element) }
open fun visitStringTemplateExpression(element: KtStringTemplateExpression) { visitElement(element) }
open fun visitSuperExpression(element: KtSuperExpression) { visitElement(element) }
open fun visitForExpression(element: KtForExpression) { visitElement(element) }
open fun visitWhileExpression(element: KtWhileExpression) { visitElement(element) }
open fun visitDoWhileExpression(element: KtDoWhileExpression) { visitElement(element) }
open fun visitBreakExpression(element: KtBreakExpression) { visitElement(element) }
open fun visitContinueExpression(element: KtContinueExpression) { visitElement(element) }
open fun visitCallableReferenceExpression(element: KtCallableReferenceExpression) { visitElement(element) }
open fun visitClassLiteralExpression(element: KtClassLiteralExpression) { visitElement(element) }
open fun visitIsExpression(element: KtIsExpression) { visitElement(element) }
open fun visitBinaryWithTypeRHSExpression(element: KtBinaryExpressionWithTypeRHS) { visitElement(element) }
open fun visitCollectionLiteralExpression(element: KtCollectionLiteralExpression) { visitElement(element) }
open fun visitTryExpression(element: KtTryExpression) { visitElement(element) }
open fun visitCatchSection(element: KtCatchClause) { visitElement(element) }
open fun visitFinallySection(element: KtFinallySection) { visitElement(element) }
open fun visitThrowExpression(element: KtThrowExpression) { visitElement(element) }
open fun visitEnumEntry(element: KtEnumEntry) { visitElement(element) }
open fun visitTypeAlias(element: KtTypeAlias) { visitElement(element) }
open fun visitDestructuringDeclaration(element: KtDestructuringDeclaration) { visitElement(element) }
open fun visitDestructuringDeclarationEntry(element: KtDestructuringDeclarationEntry) { visitElement(element) }
open fun visitPackageDirective(element: KtPackageDirective) { visitElement(element) }
open fun visitImportList(element: KtImportList) { visitElement(element) }
open fun visitImportDirective(element: KtImportDirective) { visitElement(element) }
open fun visitAnnotatedExpression(element: KtAnnotatedExpression) { visitElement(element) }
open fun visitAnnotation(element: KtAnnotation) { visitElement(element) }
open fun visitAnnotationUseSiteTarget(element: KtAnnotationUseSiteTarget, data: Void?): Void? { visitElement(element); return null }
open fun visitAnnotationEntry(element: KtAnnotationEntry) { visitElement(element) }
open fun visitFileAnnotationList(element: KtFileAnnotationList, data: Void?): Void? { visitElement(element); return null }
fun dispatch(element: PsiElement) { when(element) {
is KtEnumEntry -> visitEnumEntry(element)
is KtNamedFunction -> visitNamedFunction(element)
is KtPrimaryConstructor -> visitPrimaryConstructor(element)
is KtSecondaryConstructor -> visitSecondaryConstructor(element)
is KtScript -> visitScript(element)
is KtTypeParameter -> visitTypeParameter(element)
is KtClassOrObject -> visitClassOrObject(element)
is KtProperty -> visitProperty(element)
is KtConstructorDelegationCall -> visitConstructorDelegationCall(element)
is KtClassInitializer -> visitClassInitializer(element)
is KtSuperTypeCallEntry -> visitSuperTypeCallEntry(element)
is KtParameter -> visitParameter(element)
is KtCallExpression -> visitCallExpression(element)
is KtThisExpression -> visitThisExpression(element)
is KtSimpleNameExpression -> visitSimpleNameExpression(element)
is KtReturnExpression -> visitReturnExpression(element)
is KtPostfixExpression -> visitPostfixExpression(element)
is KtPrefixExpression -> visitPrefixExpression(element)
is KtArrayAccessExpression -> visitArrayAccessExpression(element)
is KtSuperExpression -> visitSuperExpression(element)
is KtForExpression -> visitForExpression(element)
is KtWhileExpression -> visitWhileExpression(element)
is KtDoWhileExpression -> visitDoWhileExpression(element)
is KtBreakExpression -> visitBreakExpression(element)
is KtContinueExpression -> visitContinueExpression(element)
is KtTypeAlias -> visitTypeAlias(element)
is KtDestructuringDeclaration -> visitDestructuringDeclaration(element)
is KtDestructuringDeclarationEntry -> visitDestructuringDeclarationEntry(element)
is KtAnnotationEntry -> visitAnnotationEntry(element)
is KtDynamicType -> visitDynamicType(element)
is KtNullableType -> visitNullableType(element)
is KtUserType -> visitUserType(element)
is KtIntersectionType -> visitIntersectionType(element)
is KtFunctionType -> visitFunctionType(element)
is KtQualifiedExpression -> visitQualifiedExpression(element)
is KtLambdaExpression -> visitLambdaExpression(element)
is KtReferenceExpression -> visitReferenceExpression(element)
is KtBinaryExpression -> visitBinaryExpression(element)
is KtLabeledExpression -> visitLabeledExpression(element)
is KtConstantExpression -> visitConstantExpression(element)
is KtParenthesizedExpression -> visitParenthesizedExpression(element)
is KtWhenExpression -> visitWhenExpression(element)
is KtBlockExpression -> visitBlockExpression(element)
is KtWhenConditionWithExpression -> visitWhenConditionWithExpression(element)
is KtWhenConditionIsPattern -> visitWhenConditionIsPattern(element)
is KtWhenConditionInRange -> visitWhenConditionInRange(element)
is KtIfExpression -> visitIfExpression(element)
is KtStringTemplateExpression -> visitStringTemplateExpression(element)
is KtCallableReferenceExpression -> visitCallableReferenceExpression(element)
is KtClassLiteralExpression -> visitClassLiteralExpression(element)
is KtIsExpression -> visitIsExpression(element)
is KtBinaryExpressionWithTypeRHS -> visitBinaryWithTypeRHSExpression(element)
is KtCollectionLiteralExpression -> visitCollectionLiteralExpression(element)
is KtTryExpression -> visitTryExpression(element)
is KtThrowExpression -> visitThrowExpression(element)
is KtAnnotatedExpression -> visitAnnotatedExpression(element)
is KtFile -> visitKtFile(element)
is KtTypeReference -> visitTypeReference(element)
is KtTypeProjection -> visitTypeProjection(element)
is KtTypeArgumentList -> visitTypeArgumentList(element)
is KtTypeParameterList -> visitTypeParameterList(element)
is KtTypeConstraintList -> visitTypeConstraintList(element)
is KtTypeConstraint -> visitTypeConstraint(element)
is KtValueArgument -> visitArgument(element)
is KtSuperTypeList -> visitSuperTypeList(element)
is KtDelegatedSuperTypeEntry -> visitDelegatedSuperTypeEntry(element)
is KtClassBody -> visitClassBody(element)
is KtValueArgumentList -> visitValueArgumentList(element)
is KtModifierList -> visitModifierList(element)
is KtContextReceiverList -> visitContextReceiverList(element)
is KtParameterList -> visitParameterList(element)
is KtCatchClause -> visitCatchSection(element)
is KtFinallySection -> visitFinallySection(element)
is KtPackageDirective -> visitPackageDirective(element)
is KtImportList -> visitImportList(element)
is KtImportDirective -> visitImportDirective(element)
is KtAnnotation -> visitAnnotation(element)
is KtAnnotationUseSiteTarget -> visitAnnotationUseSiteTarget(element, null)
is KtFileAnnotationList -> visitFileAnnotationList(element, null)
else -> visitElement(element)
} }
}
object KtTokens {
val COMMA = KtToken("COMMA")
val RBRACE = KtToken("RBRACE")
val SEMICOLON = KtToken("SEMICOLON")
val ELVIS = KtToken("ELVIS")
val LPAR = KtToken("LPAR")
val RPAR = KtToken("RPAR")
val RANGE = KtToken("RANGE")
val RANGE_UNTIL = KtToken("RANGE_UNTIL")
val ALL_ASSIGNMENTS = setOf("EQ", "PLUSEQ", "MINUSEQ", "MULTEQ", "DIVEQ", "PERCEQ").map(::KtToken).toSet()
}
