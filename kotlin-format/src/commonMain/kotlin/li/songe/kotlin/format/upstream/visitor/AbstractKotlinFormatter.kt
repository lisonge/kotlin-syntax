package li.songe.kotlin.format.upstream.visitor
import li.songe.kotlin.format.psi.*

import li.songe.kotlin.format.engine.Throwables
import li.songe.kotlin.format.engine.FormattingError
import li.songe.kotlin.format.engine.OpsBuilder
import li.songe.kotlin.format.upstream.FormattingOptions

abstract class AbstractKotlinFormatter(
    val options: FormattingOptions,
    val builder: OpsBuilder,
    val annotationFormatter: AnnotationFormatter = AnnotationFormatterImpl(),
    val callFormatter: CallFormatter = CallFormatterImpl(),
    val controlFlowExpressionFormatter: ControlFlowExpressionFormatter =
        ControlFlowExpressionFormatterImpl(),
    val declarationFormatter: DeclarationFormatter = DeclarationFormatterImpl(),
    val expressionFormatter: ExpressionFormatter = ExpressionFormatterImpl(),
    val fileFormatter: FileFormatter = FileFormatterImpl(),
    val listFormatter: ListFormatter = ListFormatterImpl(),
    val typeFormatter: TypeFormatter = TypeFormatterImpl(),
) : KtTreeVisitorVoid(), FormatterStateHolder {
  override val state = FormatterState(options, builder, this)

  fun format(element: PsiElement?) {
    element?.accept(this)
  }

  override fun visitKtFile(file: KtFile) {
    formatKtFile(file)
  }

  override fun visitScript(script: KtScript) {
    formatKtScript(script)
  }

  override fun visitNamedFunction(function: KtNamedFunction) {
    formatNamedFunction(function)
  }

  override fun visitTypeReference(type: KtTypeReference) {
    formatTypeReference(type)
  }

  override fun visitDynamicType(type: KtDynamicType) {
    formatDynamicType(type)
  }

  override fun visitNullableType(type: KtNullableType) {
    formatNullableType(type)
  }

  override fun visitUserType(type: KtUserType) {
    formatUserType(type)
  }

  override fun visitIntersectionType(type: KtIntersectionType) {
    formatIntersectionType(type)
  }

  override fun visitTypeProjection(type: KtTypeProjection) {
    formatTypeProjection(type)
  }

  override fun visitTypeArgumentList(list: KtTypeArgumentList) {
    formatTypeArgumentList(list)
  }

  override fun visitTypeParameterList(list: KtTypeParameterList) {
    formatTypeParameterList(list)
  }

  override fun visitTypeParameter(parameter: KtTypeParameter) {
    formatTypeParameter(parameter)
  }

  override fun visitTypeConstraintList(list: KtTypeConstraintList) {
    formatTypeConstraintList(list)
  }

  override fun visitTypeConstraint(constraint: KtTypeConstraint) {
    formatTypeConstraint(constraint)
  }

  override fun visitFunctionType(type: KtFunctionType) {
    formatFunctionType(type)
  }

  override fun visitClassOrObject(classOrObject: KtClassOrObject) {
    formatClassOrObject(classOrObject)
  }

  override fun visitProperty(property: KtProperty) {
    formatProperty(property)
  }

  override fun visitPrimaryConstructor(constructor: KtPrimaryConstructor) {
    formatPrimaryConstructor(constructor)
  }

  override fun visitSecondaryConstructor(constructor: KtSecondaryConstructor) {
    formatSecondaryConstructor(constructor)
  }

  override fun visitConstructorDelegationCall(call: KtConstructorDelegationCall) {
    formatConstructorDelegationCall(call)
  }

  override fun visitClassInitializer(initializer: KtClassInitializer) {
    formatClassInitializer(initializer)
  }

  override fun visitArgument(argument: KtValueArgument) {
    formatArgument(argument, wrapInBlock = true, brokeBeforeBrace = null)
  }

  override fun visitSuperTypeList(list: KtSuperTypeList) {
    formatSuperTypeList(list)
  }

  override fun visitSuperTypeCallEntry(call: KtSuperTypeCallEntry) {
    formatSuperTypeCallEntry(call)
  }

  override fun visitDelegatedSuperTypeEntry(specifier: KtDelegatedSuperTypeEntry) {
    formatDelegatedSuperTypeEntry(specifier)
  }

  override fun visitClassBody(body: KtClassBody) {
    formatClassBody(body)
  }

  override fun visitValueArgumentList(list: KtValueArgumentList) {
    formatValueArgumentList(list)
  }

  override fun visitModifierList(list: KtModifierList) {
    formatModifierList(list)
  }

  override fun visitContextReceiverList(contextReceiverList: KtContextReceiverList) {
    formatContextReceiverList(contextReceiverList)
  }

  override fun visitParameterList(list: KtParameterList) {
    formatParameterList(list)
  }

  override fun visitParameter(parameter: KtParameter) {
    formatParameter(parameter)
  }

  override fun visitQualifiedExpression(expression: KtQualifiedExpression) {
    formatQualifiedExpression(expression)
  }

  override fun visitCallExpression(callExpression: KtCallExpression) {
    formatCallExpression(callExpression)
  }

  override fun visitLambdaExpression(lambdaExpression: KtLambdaExpression) {
    formatLambdaExpression(lambdaExpression, brokeBeforeBrace = null)
  }

  override fun visitThisExpression(expression: KtThisExpression) {
    formatThisExpression(expression)
  }

  override fun visitSimpleNameExpression(expression: KtSimpleNameExpression) {
    formatSimpleNameExpression(expression)
  }

  override fun visitReferenceExpression(expression: KtReferenceExpression) {
    formatReferenceExpression(expression)
  }

  override fun visitReturnExpression(expression: KtReturnExpression) {
    formatReturnExpression(expression)
  }

  override fun visitBinaryExpression(expression: KtBinaryExpression) {
    formatBinaryExpression(expression)
  }

  override fun visitPostfixExpression(expression: KtPostfixExpression) {
    formatPostfixExpression(expression)
  }

  override fun visitPrefixExpression(expression: KtPrefixExpression) {
    formatPrefixExpression(expression)
  }

  override fun visitLabeledExpression(expression: KtLabeledExpression) {
    formatLabeledExpression(expression)
  }

  override fun visitConstantExpression(expression: KtConstantExpression) {
    formatConstantExpression(expression)
  }

  override fun visitParenthesizedExpression(expression: KtParenthesizedExpression) {
    formatParenthesizedExpression(expression)
  }

  override fun visitWhenExpression(expression: KtWhenExpression) {
    formatWhenExpression(expression)
  }

  override fun visitBlockExpression(expression: KtBlockExpression) {
    formatBlockExpression(expression)
  }

  override fun visitWhenConditionWithExpression(condition: KtWhenConditionWithExpression) {
    formatWhenConditionWithExpression(condition)
  }

  override fun visitWhenConditionIsPattern(condition: KtWhenConditionIsPattern) {
    formatWhenConditionIsPattern(condition)
  }

  override fun visitWhenConditionInRange(condition: KtWhenConditionInRange) {
    formatWhenConditionInRange(condition)
  }

  override fun visitIfExpression(expression: KtIfExpression) {
    formatIfExpression(expression)
  }

  override fun visitArrayAccessExpression(expression: KtArrayAccessExpression) {
    formatArrayAccessExpression(expression)
  }

  override fun visitStringTemplateExpression(expression: KtStringTemplateExpression) {
    formatStringTemplateExpression(expression)
  }

  override fun visitSuperExpression(expression: KtSuperExpression) {
    formatSuperExpression(expression)
  }

  override fun visitForExpression(expression: KtForExpression) {
    formatForExpression(expression)
  }

  override fun visitWhileExpression(expression: KtWhileExpression) {
    formatWhileExpression(expression)
  }

  override fun visitDoWhileExpression(expression: KtDoWhileExpression) {
    formatDoWhileExpression(expression)
  }

  override fun visitBreakExpression(expression: KtBreakExpression) {
    formatBreakExpression(expression)
  }

  override fun visitContinueExpression(expression: KtContinueExpression) {
    formatContinueExpression(expression)
  }

  override fun visitCallableReferenceExpression(expression: KtCallableReferenceExpression) {
    formatCallableReferenceExpression(expression)
  }

  override fun visitClassLiteralExpression(expression: KtClassLiteralExpression) {
    formatClassLiteralExpression(expression)
  }

  override fun visitIsExpression(expression: KtIsExpression) {
    formatIsExpression(expression)
  }

  override fun visitBinaryWithTypeRHSExpression(expression: KtBinaryExpressionWithTypeRHS) {
    formatBinaryWithTypeRHSExpression(expression)
  }

  override fun visitCollectionLiteralExpression(expression: KtCollectionLiteralExpression) {
    formatCollectionLiteralExpression(expression)
  }

  override fun visitTryExpression(expression: KtTryExpression) {
    formatTryExpression(expression)
  }

  override fun visitCatchSection(catchClause: KtCatchClause) {
    formatCatchSection(catchClause)
  }

  override fun visitFinallySection(finallySection: KtFinallySection) {
    formatFinallySection(finallySection)
  }

  override fun visitThrowExpression(expression: KtThrowExpression) {
    formatThrowExpression(expression)
  }

  override fun visitEnumEntry(enumEntry: KtEnumEntry) {
    formatEnumEntry(enumEntry)
  }

  override fun visitTypeAlias(typeAlias: KtTypeAlias) {
    formatTypeAlias(typeAlias)
  }

  override fun visitDestructuringDeclaration(destructuringDeclaration: KtDestructuringDeclaration) {
    formatDestructuringDeclaration(destructuringDeclaration)
  }

  override fun visitDestructuringDeclarationEntry(
      multiDeclarationEntry: KtDestructuringDeclarationEntry,
  ) {
    formatDestructuringDeclarationEntry(multiDeclarationEntry)
  }

  override fun visitPackageDirective(directive: KtPackageDirective) {
    formatPackageDirective(directive)
  }

  override fun visitImportList(importList: KtImportList) {
    formatImportList(importList)
  }

  override fun visitImportDirective(directive: KtImportDirective) {
    state.inImport {
      context(state) {
        formatImportDirective(directive)
      }
    }
  }

  override fun visitAnnotatedExpression(expression: KtAnnotatedExpression) {
    formatAnnotatedExpression(expression)
  }

  override fun visitAnnotation(annotation: KtAnnotation) {
    formatAnnotation(annotation)
  }

  override fun visitAnnotationUseSiteTarget(
      annotationTarget: KtAnnotationUseSiteTarget,
      data: Void?,
  ): Void? {
    formatAnnotationUseSiteTarget(annotationTarget)
    return null
  }

  override fun visitAnnotationEntry(annotationEntry: KtAnnotationEntry) {
    formatAnnotationEntry(annotationEntry)
  }

  override fun visitFileAnnotationList(
      fileAnnotationList: KtFileAnnotationList,
      data: Void?,
  ): Void? {
    formatFileAnnotationList(fileAnnotationList)
    return null
  }

  /**
   * visitElement is called for almost all types of AST nodes. We use it to keep track of whether
   * we're currently inside an expression or not.
   *
   * @throws FormattingError
   */
  override fun visitElement(element: PsiElement) {
    state.inElement(element) {
      val previous = builder.depth()
      try {
        super.visitElement(element)
      } catch (e: FormattingError) {
        throw e
      } catch (t: Throwable) {
        throw FormattingError(builder.diagnostic(Throwables.getStackTraceAsString(t)))
      }
      builder.checkClosed(previous)
    }
  }
}
