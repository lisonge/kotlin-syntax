package li.songe.kotlin.format.upstream.visitor
import li.songe.kotlin.format.psi.*

import li.songe.kotlin.format.engine.*

import li.songe.kotlin.format.engine.OpsBuilder
import li.songe.kotlin.format.engine.Output
import li.songe.kotlin.format.engine.Optional

import li.songe.kotlin.format.upstream.visitor.Indentation.Companion.ZERO

/** Helper method to sync the current offset to match any element in the AST */
internal fun OpsBuilder.sync(psiElement: PsiElement) {
  sync(psiElement.startOffset)
}

/** Prevent subsequent comments from being moved ahead of this point, into parent [Level]s. */
internal fun OpsBuilder.fenceComments() {
  fenceComments()
}

/**
 * Emit a [Doc.Token].
 *
 * @param token the [String] to wrap in a [Doc.Token]
 * @param plusIndentCommentsBefore extra block for comments before this token
 */
internal fun OpsBuilder.token(token: String, plusIndentCommentsBefore: Indentation = ZERO) {
  token(
      token,
      Doc.Token.RealOrImaginary.REAL,
      plusIndentCommentsBefore.indent,
      /* breakAndIndentTrailingComment */ Optional.empty(),
  )
}

/**
 * Opens a new level, emits into it and closes it.
 *
 * This is a helper method to make it easier to keep track of [OpsBuilder.open] and
 * [OpsBuilder.close] calls
 *
 * @param plusIndent the block level to pass to the block
 * @param block a code block to be run in this block level
 */
internal fun OpsBuilder.block(
    plusIndent: Indentation = ZERO,
    isEnabled: Boolean = true,
    block: () -> Unit,
) {
  if (isEnabled) {
    open(plusIndent.indent)
  }
  block()
  if (isEnabled) {
    close()
  }
}

internal fun OpsBuilder.breakOp(
    fillMode: FillMode = FillMode.UNIFIED,
    flat: String = " ",
    plusIndent: Indentation = ZERO,
    optionalTag: Optional<Output.BreakTag> = Optional.empty(),
) = breakOp(fillMode, flat, plusIndent.indent, optionalTag)

internal fun OpsBuilder.open(plusIndent: Indentation) = open(plusIndent.indent)

internal fun OpsBuilder.forcedBreak(plusIndent: Indentation) = forcedBreak(plusIndent.indent)
