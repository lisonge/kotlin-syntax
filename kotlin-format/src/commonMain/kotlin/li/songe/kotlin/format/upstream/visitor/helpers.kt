@file:Suppress("NOTHING_TO_INLINE")

package li.songe.kotlin.format.upstream.visitor
import li.songe.kotlin.format.psi.*

import li.songe.kotlin.format.engine.FormattingError
import li.songe.kotlin.format.engine.OpsBuilder
import li.songe.kotlin.format.engine.Output.BreakTag
import li.songe.kotlin.format.upstream.FormattingOptions

context(holder: FormatterStateHolder)
internal inline val state
  get() = holder.state

context(_: FormatterStateHolder)
internal inline val formatter
  get() = state.formatter

context(_: FormatterStateHolder)
internal inline val options: FormattingOptions
  get() = state.options

context(_: FormatterStateHolder)
internal inline val builder: OpsBuilder
  get() = state.builder

context(_: FormatterStateHolder)
internal inline val blockIndent: Indentation.Const
  get() = state.blockIndent

context(_: FormatterStateHolder)
internal inline val expressionBreakIndent: Indentation.Const
  get() = state.expressionBreakIndent

context(_: FormatterStateHolder)
internal inline val inImport: Boolean
  get() = state.inImport

context(_: FormatterStateHolder)
internal inline fun format(element: PsiElement?) {
  formatter.format(element)
}

context(_: FormatterStateHolder)
internal inline fun markForPartialFormat() {
  state.markForPartialFormat()
}

/**
 * Throws a formatting error
 *
 * This is used as `expr ?: fail()` to avoid using the !! operator and provide better error
 * messages.
 */
context(_: FormatterStateHolder)
internal inline fun fail(message: String = "Unexpected"): Nothing {
  throw FormattingError(builder.diagnostic(message))
}

context(_: FormatterStateHolder)
internal inline fun formatAnnotatedExpression(expression: KtAnnotatedExpression) {
  formatter.annotationFormatter.formatAnnotatedExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatAnnotation(annotation: KtAnnotation) {
  formatter.annotationFormatter.formatAnnotation(annotation)
}

context(_: FormatterStateHolder)
internal inline fun formatAnnotationUseSiteTarget(annotationTarget: KtAnnotationUseSiteTarget) {
  formatter.annotationFormatter.formatAnnotationUseSiteTarget(annotationTarget)
}

context(_: FormatterStateHolder)
internal inline fun formatAnnotationEntry(annotationEntry: KtAnnotationEntry) {
  formatter.annotationFormatter.formatAnnotationEntry(annotationEntry)
}

context(_: FormatterStateHolder)
internal inline fun formatArgument(
    argument: KtValueArgument,
    wrapInBlock: Boolean,
    brokeBeforeBrace: BreakTag?,
) {
  formatter.callFormatter.formatArgument(argument, wrapInBlock, brokeBeforeBrace)
}

context(_: FormatterStateHolder)
internal inline fun formatCallExpression(callExpression: KtCallExpression) {
  formatter.callFormatter.formatCallExpression(callExpression)
}

context(_: FormatterStateHolder)
internal inline fun formatFunctionCall(
    callee: KtExpression?,
    typeArgumentList: KtTypeArgumentList?,
    argumentList: KtValueArgumentList?,
    trailingLambda: KtLambdaArgument?,
    argumentsIndent: Indentation = expressionBreakIndent,
    lambdaIndent: Indentation = Indentation.ZERO,
) {
  formatter.callFormatter.formatFunctionCall(
      callee,
      typeArgumentList,
      argumentList,
      trailingLambda,
      argumentsIndent,
      lambdaIndent,
  )
}

context(_: FormatterStateHolder)
internal inline fun formatLambdaExpression(
    lambdaExpression: KtLambdaExpression,
    brokeBeforeBrace: BreakTag?,
) {
  formatter.callFormatter.formatLambdaExpression(lambdaExpression, brokeBeforeBrace)
}

context(_: FormatterStateHolder)
internal inline fun formatChainedBlockLikeCall(
    expression: KtQualifiedExpression,
    emitLeadingBreak: Boolean,
) {
  formatter.callFormatter.formatChainedBlockLikeCall(expression, emitLeadingBreak)
}

context(_: FormatterStateHolder)
internal inline fun formatChainedScopingFunction(
    expression: KtQualifiedExpression,
    emitLeadingBreak: Boolean,
) {
  formatter.callFormatter.formatChainedScopingFunction(expression, emitLeadingBreak)
}

context(_: FormatterStateHolder)
internal inline fun formatLambdaOrScopingFunction(
    expr: PsiElement?,
    emitLeadingBreak: Boolean = true,
) {
  formatter.callFormatter.formatLambdaOrScopingFunction(expr, emitLeadingBreak)
}

context(_: FormatterStateHolder)
internal inline fun formatQualifiedExpression(expression: KtQualifiedExpression) {
  formatter.callFormatter.formatQualifiedExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatArrayAccessExpression(expression: KtArrayAccessExpression) {
  formatter.callFormatter.formatArrayAccessExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatReturnExpression(expression: KtReturnExpression) {
  formatter.controlFlowExpressionFormatter.formatReturnExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatWhenExpression(expression: KtWhenExpression) {
  formatter.controlFlowExpressionFormatter.formatWhenExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatWhenConditionWithExpression(condition: KtWhenConditionWithExpression) {
  formatter.controlFlowExpressionFormatter.formatWhenConditionWithExpression(condition)
}

context(_: FormatterStateHolder)
internal inline fun formatWhenConditionIsPattern(condition: KtWhenConditionIsPattern) {
  formatter.controlFlowExpressionFormatter.formatWhenConditionIsPattern(condition)
}

context(_: FormatterStateHolder)
internal inline fun formatWhenConditionInRange(condition: KtWhenConditionInRange) {
  formatter.controlFlowExpressionFormatter.formatWhenConditionInRange(condition)
}

context(_: FormatterStateHolder)
internal inline fun formatIfExpression(expression: KtIfExpression) {
  formatter.controlFlowExpressionFormatter.formatIfExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatForExpression(expression: KtForExpression) {
  formatter.controlFlowExpressionFormatter.formatForExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatWhileExpression(expression: KtWhileExpression) {
  formatter.controlFlowExpressionFormatter.formatWhileExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatDoWhileExpression(expression: KtDoWhileExpression) {
  formatter.controlFlowExpressionFormatter.formatDoWhileExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatBreakExpression(expression: KtBreakExpression) {
  formatter.controlFlowExpressionFormatter.formatBreakExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatContinueExpression(expression: KtContinueExpression) {
  formatter.controlFlowExpressionFormatter.formatContinueExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatTryExpression(expression: KtTryExpression) {
  formatter.controlFlowExpressionFormatter.formatTryExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatCatchSection(catchClause: KtCatchClause) {
  formatter.controlFlowExpressionFormatter.formatCatchSection(catchClause)
}

context(_: FormatterStateHolder)
internal inline fun formatFinallySection(finallySection: KtFinallySection) {
  formatter.controlFlowExpressionFormatter.formatFinallySection(finallySection)
}

context(_: FormatterStateHolder)
internal inline fun formatThrowExpression(expression: KtThrowExpression) {
  formatter.controlFlowExpressionFormatter.formatThrowExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatNamedFunction(function: KtNamedFunction) {
  formatter.declarationFormatter.formatNamedFunction(function)
}

context(_: FormatterStateHolder)
internal inline fun formatClassOrObject(classOrObject: KtClassOrObject) {
  formatter.declarationFormatter.formatClassOrObject(classOrObject)
}

context(_: FormatterStateHolder)
internal inline fun formatPrimaryConstructor(constructor: KtPrimaryConstructor) {
  formatter.declarationFormatter.formatPrimaryConstructor(constructor)
}

context(_: FormatterStateHolder)
internal inline fun formatProperty(property: KtProperty) {
  formatter.declarationFormatter.formatProperty(property)
}

context(_: FormatterStateHolder)
internal inline fun formatSecondaryConstructor(constructor: KtSecondaryConstructor) {
  formatter.declarationFormatter.formatSecondaryConstructor(constructor)
}

context(_: FormatterStateHolder)
internal inline fun formatConstructorDelegationCall(call: KtConstructorDelegationCall) {
  formatter.declarationFormatter.formatConstructorDelegationCall(call)
}

context(_: FormatterStateHolder)
internal inline fun formatClassInitializer(initializer: KtClassInitializer) {
  formatter.declarationFormatter.formatClassInitializer(initializer)
}

context(_: FormatterStateHolder)
internal inline fun formatSuperTypeCallEntry(call: KtSuperTypeCallEntry) {
  formatter.declarationFormatter.formatSuperTypeCallEntry(call)
}

context(_: FormatterStateHolder)
internal inline fun formatDelegatedSuperTypeEntry(specifier: KtDelegatedSuperTypeEntry) {
  formatter.declarationFormatter.formatDelegatedSuperTypeEntry(specifier)
}

context(_: FormatterStateHolder)
internal inline fun formatClassBody(body: KtClassBody) {
  formatter.declarationFormatter.formatClassBody(body)
}

context(_: FormatterStateHolder)
internal inline fun formatEnumEntry(enumEntry: KtEnumEntry) {
  formatter.declarationFormatter.formatEnumEntry(enumEntry)
}

context(_: FormatterStateHolder)
internal inline fun formatParameter(parameter: KtParameter) {
  formatter.declarationFormatter.formatParameter(parameter)
}

context(_: FormatterStateHolder)
internal inline fun formatBlockExpression(expression: KtBlockExpression) {
  formatter.declarationFormatter.formatBlockExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatDestructuringDeclaration(
    destructuringDeclaration: KtDestructuringDeclaration,
) {
  formatter.declarationFormatter.formatDestructuringDeclaration(destructuringDeclaration)
}

context(_: FormatterStateHolder)
internal inline fun formatDestructuringDeclarationEntry(
    multiDeclarationEntry: KtDestructuringDeclarationEntry,
) {
  formatter.declarationFormatter.formatDestructuringDeclarationEntry(multiDeclarationEntry)
}

context(_: FormatterStateHolder)
internal inline fun formatInitializerExpression(
    initializer: KtExpression,
    assignmentOp: String = "=",
) {
  formatter.expressionFormatter.formatInitializerExpression(initializer, assignmentOp)
}

context(_: FormatterStateHolder)
internal inline fun formatThisExpression(expression: KtThisExpression) {
  formatter.expressionFormatter.formatThisExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatSimpleNameExpression(expression: KtSimpleNameExpression) {
  formatter.expressionFormatter.formatSimpleNameExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatReferenceExpression(expression: KtReferenceExpression) {
  formatter.expressionFormatter.formatReferenceExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatBinaryExpression(expression: KtBinaryExpression) {
  formatter.expressionFormatter.formatBinaryExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatPostfixExpression(expression: KtPostfixExpression) {
  formatter.expressionFormatter.formatPostfixExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatPrefixExpression(expression: KtPrefixExpression) {
  formatter.expressionFormatter.formatPrefixExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatLabeledExpression(expression: KtLabeledExpression) {
  formatter.expressionFormatter.formatLabeledExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatConstantExpression(expression: KtConstantExpression) {
  formatter.expressionFormatter.formatConstantExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatParenthesizedExpression(expression: KtParenthesizedExpression) {
  formatter.expressionFormatter.formatParenthesizedExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatStringTemplateExpression(expression: KtStringTemplateExpression) {
  formatter.expressionFormatter.formatStringTemplateExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatSuperExpression(expression: KtSuperExpression) {
  formatter.expressionFormatter.formatSuperExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatCallableReferenceExpression(expression: KtCallableReferenceExpression) {
  formatter.expressionFormatter.formatCallableReferenceExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatClassLiteralExpression(expression: KtClassLiteralExpression) {
  formatter.expressionFormatter.formatClassLiteralExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatIsExpression(expression: KtIsExpression) {
  formatter.expressionFormatter.formatIsExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatBinaryWithTypeRHSExpression(expression: KtBinaryExpressionWithTypeRHS) {
  formatter.expressionFormatter.formatBinaryWithTypeRHSExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatCollectionLiteralExpression(expression: KtCollectionLiteralExpression) {
  formatter.expressionFormatter.formatCollectionLiteralExpression(expression)
}

context(_: FormatterStateHolder)
internal inline fun formatKtFile(file: KtFile) {
  formatter.fileFormatter.formatKtFile(file)
}

context(_: FormatterStateHolder)
internal inline fun formatKtScript(script: KtScript) {
  formatter.fileFormatter.formatKtScript(script)
}

context(_: FormatterStateHolder)
internal inline fun formatStatement(statement: PsiElement) {
  formatter.fileFormatter.formatStatement(statement)
}

context(_: FormatterStateHolder)
internal inline fun formatStatements(statements: Array<PsiElement>) {
  formatter.fileFormatter.formatStatements(statements)
}

context(_: FormatterStateHolder)
internal inline fun formatPackageDirective(directive: KtPackageDirective) {
  formatter.fileFormatter.formatPackageDirective(directive)
}

context(_: FormatterStateHolder)
internal inline fun formatImportDirective(directive: KtImportDirective) {
  formatter.fileFormatter.formatImportDirective(directive)
}

context(_: FormatterStateHolder)
internal inline fun formatTypeArgumentList(list: KtTypeArgumentList) {
  formatter.listFormatter.formatTypeArgumentList(list)
}

context(_: FormatterStateHolder)
internal inline fun formatTypeParameterList(list: KtTypeParameterList) {
  formatter.listFormatter.formatTypeParameterList(list)
}

context(_: FormatterStateHolder)
internal inline fun formatTypeConstraintList(list: KtTypeConstraintList) {
  formatter.listFormatter.formatTypeConstraintList(list)
}

context(_: FormatterStateHolder)
internal inline fun formatSuperTypeList(list: KtSuperTypeList) {
  formatter.listFormatter.formatSuperTypeList(list)
}

context(_: FormatterStateHolder)
internal inline fun formatValueArgumentList(list: KtValueArgumentList): BreakTag? =
    formatter.listFormatter.formatValueArgumentList(list)

context(_: FormatterStateHolder)
internal inline fun formatModifierList(list: KtModifierList) {
  formatter.listFormatter.formatModifierList(list)
}

context(_: FormatterStateHolder)
internal inline fun formatContextReceiverList(contextReceiverList: KtContextReceiverList) {
  formatter.listFormatter.formatContextReceiverList(contextReceiverList)
}

context(_: FormatterStateHolder)
internal inline fun formatParameterList(list: KtParameterList) {
  formatter.listFormatter.formatParameterList(list)
}

context(_: FormatterStateHolder)
internal inline fun formatImportList(importList: KtImportList) {
  formatter.listFormatter.formatImportList(importList)
}

context(_: FormatterStateHolder)
internal inline fun formatFileAnnotationList(fileAnnotationList: KtFileAnnotationList) {
  formatter.listFormatter.formatFileAnnotationList(fileAnnotationList)
}

context(_: FormatterStateHolder)
internal inline fun formatCommaSeparatedList(
    list: Iterable<PsiElement>,
    forceMultiline: Boolean = false,
    wrapInBlock: Boolean = true,
    emitLeadingBreak: Boolean = true,
    prefix: String? = null,
    postfix: String? = null,
    breakAfterPrefix: Boolean = true,
    breakBeforePostfix: Boolean = options.manageTrailingCommas,
): BreakTag? =
    formatter.listFormatter.formatCommaSeparatedList(
        list,
        forceMultiline,
        wrapInBlock,
        emitLeadingBreak,
        prefix,
        postfix,
        breakAfterPrefix,
        breakBeforePostfix,
    )

context(_: FormatterStateHolder)
internal inline fun formatTypeReference(type: KtTypeReference) {
  formatter.typeFormatter.formatTypeReference(type)
}

context(_: FormatterStateHolder)
internal inline fun formatDynamicType(type: KtDynamicType) {
  formatter.typeFormatter.formatDynamicType(type)
}

context(_: FormatterStateHolder)
internal inline fun formatNullableType(type: KtNullableType) {
  formatter.typeFormatter.formatNullableType(type)
}

context(_: FormatterStateHolder)
internal inline fun formatUserType(type: KtUserType) {
  formatter.typeFormatter.formatUserType(type)
}

context(_: FormatterStateHolder)
internal inline fun formatIntersectionType(type: KtIntersectionType) {
  formatter.typeFormatter.formatIntersectionType(type)
}

context(_: FormatterStateHolder)
internal inline fun formatTypeProjection(type: KtTypeProjection) {
  formatter.typeFormatter.formatTypeProjection(type)
}

context(_: FormatterStateHolder)
internal inline fun formatTypeParameter(parameter: KtTypeParameter) {
  formatter.typeFormatter.formatTypeParameter(parameter)
}

context(_: FormatterStateHolder)
internal inline fun formatTypeConstraint(constraint: KtTypeConstraint) {
  formatter.typeFormatter.formatTypeConstraint(constraint)
}

context(_: FormatterStateHolder)
internal inline fun formatFunctionType(type: KtFunctionType) {
  formatter.typeFormatter.formatFunctionType(type)
}

context(_: FormatterStateHolder)
internal inline fun formatTypeAlias(typeAlias: KtTypeAlias) {
  formatter.typeFormatter.formatTypeAlias(typeAlias)
}
