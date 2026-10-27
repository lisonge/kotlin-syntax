package li.songe.kotlin.format.upstream.visitor.kotlinlang
import li.songe.kotlin.format.psi.*

import li.songe.kotlin.format.engine.*
import li.songe.kotlin.format.upstream.visitor.AnnotationFormatterImpl
import li.songe.kotlin.format.upstream.visitor.FormatterStateHolder
import li.songe.kotlin.format.upstream.visitor.Indentation.Companion.ZERO
import li.songe.kotlin.format.upstream.visitor.block
import li.songe.kotlin.format.upstream.visitor.breakOp
import li.songe.kotlin.format.upstream.visitor.builder
import li.songe.kotlin.format.upstream.visitor.format
import li.songe.kotlin.format.upstream.visitor.isBinaryExpression
import li.songe.kotlin.format.upstream.visitor.sync
import li.songe.kotlin.format.upstream.visitor.topLevelAnnotations

/**
 * Custom annotation expression formatter for KotlinLang style. For annotations on declarations and
 * types see [KotlinLangListFormatterImpl].
 *
 * General rule for annotations on an expression: keep annotations on the same line as the
 * expression; if the line does not fit, force each annotation into a new line.
 *
 * Exceptions:
 * - Return expressions always force a break
 * - Lambda expressions never force a break, annotation is always glued to `{`
 * - Binary expressions in a block are break sensitive w.r.t. annotations. Therefore, we have to
 *   preserve the original formatting
 *
 * ```
 * @Anno a + b = (@Anno a) + b
 *
 * @Anno
 * a + b = @Anno (a + b)
 * ```
 */
internal class KotlinLangAnnotationFormatterImpl : AnnotationFormatterImpl() {
  context(_: FormatterStateHolder)
  override fun formatAnnotatedExpression(expression: KtAnnotatedExpression) {
    builder.sync(expression)
    val baseExpression = expression.baseExpression

    builder.block {
      val annotations = expression.topLevelAnnotations
      for ((index, annotationEntry) in annotations.withIndex()) {
        if (index > 0) {
          builder.breakOp(FillMode.UNIFIED, " ", ZERO)
        }
        format(annotationEntry)
      }

      when {
        baseExpression.isBinaryExpression && expression.parent is KtBlockExpression ->
            builder.forcedBreak()
        baseExpression is KtLambdaExpression -> builder.space()
        baseExpression is KtReturnExpression -> builder.forcedBreak()
        else -> builder.breakOp(FillMode.UNIFIED, " ", ZERO)
      }

      format(expression.baseExpression)
    }
  }
}
