/* Copyright (c) Meta Platforms, Inc. and affiliates. Licensed under Apache-2.0. */
package li.songe.kotlin.format.upstream

import li.songe.kotlin.format.psi.PsiElement

class ParseError(message: String, val offset: Int = 0) : IllegalArgumentException(message) {
    constructor(message: String, element: PsiElement) : this(message, element.startOffset)
}
object WhitespaceTombstones {
    const val SPACE_TOMBSTONE = '\u0003'
    private val trailing = Regex(" ($)", RegexOption.MULTILINE)
    fun replaceTrailingWhitespaceWithTombstone(s: String): String = trailing.replace(s) { "$SPACE_TOMBSTONE${it.groupValues[1]}" }
    fun replaceTombstoneWithTrailingWhitespace(s: String): String = s.replace(SPACE_TOMBSTONE, ' ')
}
