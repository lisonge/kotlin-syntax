package li.songe.kotlin.format.upstream.visitor.kotlinlang
import li.songe.kotlin.format.psi.*

import li.songe.kotlin.format.engine.*
import li.songe.kotlin.format.engine.Indent.Const.Companion.ZERO
import li.songe.kotlin.format.engine.Output.BreakTag
import li.songe.kotlin.format.upstream.visitor.FormatterStateHolder
import li.songe.kotlin.format.upstream.visitor.ListFormatterImpl
import li.songe.kotlin.format.upstream.visitor.builder
import li.songe.kotlin.format.upstream.visitor.format
import li.songe.kotlin.format.upstream.visitor.hasEmptyParenthesis
import li.songe.kotlin.format.upstream.visitor.isBlockLikeArgument
import li.songe.kotlin.format.upstream.visitor.isUnnamedLambda
import li.songe.kotlin.format.upstream.visitor.options
import li.songe.kotlin.format.upstream.visitor.sync
import li.songe.kotlin.format.upstream.visitor.token

/**
 * Custom formatter for KotlinLang style. Handles annotation formatting for declarations and types
 * by overriding [formatModifierList]. For annotations on expressions see
 * [KotlinLangAnnotationFormatterImpl].
 *
 * General rules for annotations in modifier lists:
 * - One annotation per line (forced breaks) for class-like declarations
 * - One annotation per line for function-like declarations, including:
 *     - Top-level functions
 *     - Class members, including constructors (except primary constructors)
 *     - Property accessors
 * - One annotation per line for properties
 * - No forced breaks for everything else
 *
 * [formatValueArgumentList] implements the behaviour introduced in #634 that is reverted in the
 * default style: force the closing bracket in exploded function calls to the new line.
 *
 * ```
 * foo(
 *    a,
 *    b // previously this was `b)`
 * )
 * ```
 *
 * See [KotlinLangCallFormatterImpl] for more details.
 */
internal class KotlinLangListFormatterImpl : ListFormatterImpl() {
  context(_: FormatterStateHolder)
  override fun formatModifierList(list: KtModifierList) {
    builder.sync(list)
    var onlyAnnotationsSoFar = true

    for (child in list.node.children()) {
      val psi = child.psi
      if (psi is PsiWhiteSpace) {
        continue
      }

      // In Kotlin 2.3+, context receiver lists are children of the modifier list.
      // Handle them directly to avoid issues with the visitor dispatch.
      if (psi is KtContextReceiverList) {
        formatContextReceiverList(psi)
        builder.forcedBreak()
        continue
      }

      if (child.elementType is KtModifierKeywordToken) {
        onlyAnnotationsSoFar = false
        builder.token(child.text)
      } else {
        format(psi)
      }

      val shouldForceBreak =
          list.parent is KtClassOrObject ||
              (list.parent is KtFunction && list.parent !is KtPrimaryConstructor) ||
              (list.parent is KtPropertyAccessor) ||
              (list.parent is KtProperty)
      if (onlyAnnotationsSoFar && shouldForceBreak) {
        builder.forcedBreak()
      } else if (onlyAnnotationsSoFar) {
        builder.breakOp(FillMode.UNIFIED, " ", ZERO)
      } else {
        builder.space()
      }
    }
  }

  context(_: FormatterStateHolder)
  override fun formatValueArgumentList(list: KtValueArgumentList): BreakTag? {
    builder.sync(list)

    val arguments = list.arguments
    val isSingleUnnamedLambda = arguments.singleOrNull()?.isUnnamedLambda ?: false
    val hasTrailingComma = list.trailingComma != null
    val hasEmptyParens = list.hasEmptyParenthesis

    val wrapInBlock: Boolean
    val breakBeforePostfix: Boolean
    val leadingBreak: Boolean
    val breakAfterPrefix: Boolean
    if (isSingleUnnamedLambda) {
      wrapInBlock = true
      breakBeforePostfix = false
      leadingBreak = !hasEmptyParens && hasTrailingComma
      breakAfterPrefix = false
    } else {
      // A call without a trailing comma that is nonetheless forced onto multiple lines (because one
      // of its arguments is itself a block-like multiline call) is rendered "exploded", with its
      // closing parenthesis on its own line, just like a call with a trailing comma.
      val contentForcesMultiline = !hasTrailingComma && arguments.any { it.isBlockLikeArgument }
      wrapInBlock = !options.manageTrailingCommas
      breakBeforePostfix =
          (options.manageTrailingCommas || contentForcesMultiline) && !hasEmptyParens
      leadingBreak = !hasEmptyParens
      breakAfterPrefix = !hasEmptyParens
    }

    return formatCommaSeparatedList(
        arguments,
        forceMultiline = hasTrailingComma,
        wrapInBlock = wrapInBlock,
        emitLeadingBreak = leadingBreak,
        prefix = "(",
        postfix = ")",
        breakAfterPrefix = breakAfterPrefix,
        breakBeforePostfix = breakBeforePostfix,
    )
  }
}
