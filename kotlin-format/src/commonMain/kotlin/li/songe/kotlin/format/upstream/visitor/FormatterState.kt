package li.songe.kotlin.format.upstream.visitor
import li.songe.kotlin.format.psi.*

import li.songe.kotlin.format.engine.OpsBuilder
import li.songe.kotlin.format.upstream.FormattingOptions

interface FormatterStateHolder {
  val state: FormatterState
}

class FormatterState(
    val options: FormattingOptions,
    val builder: OpsBuilder,
    val formatter: AbstractKotlinFormatter,
) {
  val blockIndent = Indentation.Const(options.blockIndent)
  val expressionBreakIndent = Indentation.Const(options.continuationIndent)

  val inExpressionTracker = mutableListOf(false)
  val inExpression: Boolean
    get() = inExpressionTracker.last()

  var inImport: Boolean = false

  /**
   * markForPartialFormat is used to delineate the smallest areas of code that must be formatted
   * together.
   *
   * When only parts of the code are being formatted, the requested area is expanded until it's
   * covered by an area marked by this method.
   */
  fun markForPartialFormat() {
    if (!inExpression) {
      builder.markForPartialFormat()
    }
  }

  inline fun inImport(body: () -> Unit) {
    inImport = true
    try {
      body()
    } finally {
      inImport = false
    }
  }

  inline fun inElement(element: PsiElement, body: () -> Unit) {
    inExpressionTracker.add(element is KtExpression || inExpressionTracker.last())
    try {
      body()
    } finally {
      inExpressionTracker.removeLast()
    }
  }
}
