package li.songe.kotlin.format.upstream.visitor.kotlinlang
import li.songe.kotlin.format.psi.*

import li.songe.kotlin.format.engine.*
import li.songe.kotlin.format.upstream.visitor.ExpressionFormatterImpl
import li.songe.kotlin.format.upstream.visitor.FormatterStateHolder
import li.songe.kotlin.format.upstream.visitor.block
import li.songe.kotlin.format.upstream.visitor.breakOp
import li.songe.kotlin.format.upstream.visitor.builder
import li.songe.kotlin.format.upstream.visitor.expressionBreakIndent
import li.songe.kotlin.format.upstream.visitor.fenceComments
import li.songe.kotlin.format.upstream.visitor.format
import li.songe.kotlin.format.upstream.visitor.formatChainedBlockLikeCall
import li.songe.kotlin.format.upstream.visitor.formatChainedScopingFunction
import li.songe.kotlin.format.upstream.visitor.formatLambdaOrScopingFunction
import li.songe.kotlin.format.upstream.visitor.isBlockLikeCall
import li.songe.kotlin.format.upstream.visitor.isChainedBlockLikeCall
import li.songe.kotlin.format.upstream.visitor.isChainedScopingFunction
import li.songe.kotlin.format.upstream.visitor.isLambdaOrScopingFunction
import li.songe.kotlin.format.upstream.visitor.token

/**
 * Custom expression formatter for KotlinLang style that handles formatting of block-like calls with
 * or without chained call (see #633). Currently, it extracts the behaviour introduced in #634 to an
 * experimental engine API. Motivation: we don't want to change the behaviour of the existing
 * formatter while we're also evolving the new Kotlin Lang style.
 */
internal class KotlinLangExpressionFormatterImpl : ExpressionFormatterImpl() {
  context(_: FormatterStateHolder)
  override fun formatInitializerExpression(initializer: KtExpression, assignmentOp: String) {
    builder.token(assignmentOp)
    if (initializer.isLambdaOrScopingFunction) {
      formatLambdaOrScopingFunction(initializer)
    } else if (initializer.isChainedScopingFunction) {
      formatChainedScopingFunction(initializer, emitLeadingBreak = true)
    } else if (initializer.isBlockLikeCall) {
      builder.space()
      format(initializer)
    } else if (initializer.isChainedBlockLikeCall) {
      formatChainedBlockLikeCall(initializer, emitLeadingBreak = true)
    } else {
      builder.breakOp(FillMode.UNIFIED, " ", expressionBreakIndent)
      builder.block(expressionBreakIndent) {
        builder.fenceComments()
        format(initializer)
      }
    }
  }
}
