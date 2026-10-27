package li.songe.kotlin.format.upstream.visitor.kotlinlang
import li.songe.kotlin.format.psi.*

import li.songe.kotlin.format.engine.*
import li.songe.kotlin.format.engine.Output.BreakTag
import li.songe.kotlin.format.engine.Optional
import li.songe.kotlin.format.upstream.visitor.CallFormatterImpl
import li.songe.kotlin.format.upstream.visitor.FormatterStateHolder
import li.songe.kotlin.format.upstream.visitor.Indentation
import li.songe.kotlin.format.upstream.visitor.Indentation.Companion.ZERO
import li.songe.kotlin.format.upstream.visitor.block
import li.songe.kotlin.format.upstream.visitor.breakOp
import li.songe.kotlin.format.upstream.visitor.builder
import li.songe.kotlin.format.upstream.visitor.chainRoot
import li.songe.kotlin.format.upstream.visitor.chainedSelectorsHaveValueArguments
import li.songe.kotlin.format.upstream.visitor.computeGroups
import li.songe.kotlin.format.upstream.visitor.expressionBreakIndent
import li.songe.kotlin.format.upstream.visitor.format
import li.songe.kotlin.format.upstream.visitor.inImport
import li.songe.kotlin.format.upstream.visitor.isBlockLikeCall
import li.songe.kotlin.format.upstream.visitor.isChainedBlockLikeCall
import li.songe.kotlin.format.upstream.visitor.isChainedScopingFunction
import li.songe.kotlin.format.upstream.visitor.isMultilineScopingFunction
import li.songe.kotlin.format.upstream.visitor.open
import li.songe.kotlin.format.upstream.visitor.options
import li.songe.kotlin.format.upstream.visitor.sync
import li.songe.kotlin.format.upstream.visitor.token
import li.songe.kotlin.format.upstream.visitor.trailingLambda

/**
 * Custom call formatter for KotlinLang style that handles indentation of block-like calls with or
 * without chained call (see #633). Currently, it extracts the behaviour introduced in #634 to an
 * experimental engine API. Motivation: we don't want to change the behaviour of the existing
 * formatter while we're also evolving the new Kotlin Lang style.
 */
internal class KotlinLangCallFormatterImpl : CallFormatterImpl() {
  context(_: FormatterStateHolder)
  override fun formatQualifiedExpression(expression: KtQualifiedExpression) {
    builder.sync(expression)
    val receiver = expression.receiverExpression
    when {
      inImport -> {
        format(receiver)
        val selectorExpression = expression.selectorExpression
        if (selectorExpression != null) {
          builder.token(".")
          format(selectorExpression)
        }
      }
      receiver is KtStringTemplateExpression -> {
        builder.block(expressionBreakIndent) {
          format(receiver)
          builder.breakOp(FillMode.UNIFIED, "", ZERO)
          builder.token(expression.operationSign.value)
          format(expression.selectorExpression)
        }
      }
      receiver is KtWhenExpression -> {
        builder.block {
          format(receiver)
          builder.token(expression.operationSign.value)
          format(expression.selectorExpression)
        }
      }
      expression.isChainedScopingFunction &&
          expression.chainRoot.isMultilineScopingFunction &&
          !chainedSelectorsHaveValueArguments(expression) -> {
        formatChainedScopingFunction(expression, emitLeadingBreak = false)
      }
      expression.isChainedBlockLikeCall -> {
        formatChainedBlockLikeCall(expression, emitLeadingBreak = false)
      }
      else -> {
        emitQualifiedExpression(expression)
      }
    }
  }

  context(_: FormatterStateHolder)
  override fun emitQualifiedExpression(expression: KtExpression) {
    val groupingInfos = expression.computeGroups(expressionBreakIndent)
    builder.block(expressionBreakIndent) {
      // allows adjusting arguments indentation if a break will be made
      val nameTag = BreakTag()
      for ((ktExpression, openingGroups, closingGroups, isTrailingLambda, isLast) in
          groupingInfos) {
        if (ktExpression is KtQualifiedExpression) {
          builder.breakOp(FillMode.UNIFIED, "", ZERO, Optional.of(nameTag))
        }

        var deferredCallArguments: DeferredCallArguments? = null
        repeat(openingGroups) { builder.open(ZERO) }
        when (ktExpression) {
          is KtQualifiedExpression if ktExpression.selectorExpression is KtCallExpression -> {
            builder.token(ktExpression.operationSign.value)
            val selectorExpression = ktExpression.selectorExpression as KtCallExpression

            // emit `doIt` from `doIt(1, 2) { it }`
            format(selectorExpression.calleeExpression)

            val isLastPartOrBlockLikeCall =
                isLast || !options.manageTrailingCommas && selectorExpression.isBlockLikeCall
            val argsIndentElse = if (isLastPartOrBlockLikeCall) ZERO else expressionBreakIndent
            val lambdaIndentElse = if (isTrailingLambda) -expressionBreakIndent else ZERO

            // remember to emit `(1, 2) { it }` from `doIt(1, 2) { it }`
            deferredCallArguments =
                DeferredCallArguments(
                    selectorExpression,
                    Indentation.If(nameTag, expressionBreakIndent, argsIndentElse),
                    Indentation.If(nameTag, ZERO, lambdaIndentElse),
                )
          }
          is KtQualifiedExpression -> {
            builder.token(ktExpression.operationSign.value)
            format(ktExpression.selectorExpression)
          }
          is KtArrayAccessExpression -> formatArrayAccessBrackets(ktExpression)
          is KtPostfixExpression -> builder.token(ktExpression.operationReference.text)
          else -> format(ktExpression)
        }
        repeat(closingGroups) { builder.close() }

        deferredCallArguments?.let { (callee, argumentsIndent, lambdaIndent) ->
          formatFunctionCall(
              null,
              callee.typeArgumentList,
              callee.valueArgumentList,
              callee.trailingLambda,
              argumentsIndent = argumentsIndent,
              lambdaIndent = lambdaIndent,
          )
        }
      }
    }
  }
}
