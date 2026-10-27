/* Copyright 2015 Google Inc. Licensed under Apache-2.0.
 * Adapted from google-java-format 1.23.0 OpsBuilder and ktfmt 0.65 KotlinInput. */
package li.songe.kotlin.format.engine
import li.songe.kotlin.format.psi.*
import li.songe.kotlin.format.upstream.WhitespaceTombstones

class Optional<T> private constructor(private val value: T?) {
    val isPresent get() = value != null
    fun get(): T = value ?: error("Empty optional")
    fun orElse(other: T): T = value ?: other
    fun <R> map(fn: (T) -> R): Optional<R> = ofNullable(value?.let(fn))
    companion object {
        fun <T> empty(): Optional<T> = Optional(null)
        fun <T> of(value: T): Optional<T> = Optional(value)
        fun <T> ofNullable(value: T?): Optional<T> = Optional(value)
    }
}
fun <T> Optional<T>.getOrNull(): T? = if (isPresent) get() else null
class FormattingError(message: String) : RuntimeException(message)
object Throwables { fun getStackTraceAsString(t: Throwable) = t.stackTraceToString() }
object Output { class BreakTag : li.songe.kotlin.format.engine.BreakTag() { fun wasBreakTaken() = taken } }
object Doc { object Token { enum class RealOrImaginary { REAL, IMAGINARY } } }
class OpsBuilder(val root: PsiElement) {
    internal data class Tok(val index: Int, val text: String, val position: Int, val isToken: Boolean) {
        val lineComment get() = text.startsWith("//")
        val blockComment get() = text.startsWith("/*")
        val javadoc get() = text.startsWith("/**") && text.length > 4
        val comment get() = lineComment || blockComment || text.startsWith("#!")
        val newline get() = text == "\n" || text == "\r" || text == "\r\n"
    }
    private data class Token(val before: List<Tok>, val tok: Tok, val after: List<Tok>)
    private data class TokenOp(val position: Int, val token: Token, val real: Boolean, val indent: Indent, val trailing: Indent?)
    private val toks = buildList {
        var index = 0
        fun visit(e: PsiElement) {
            when {
                e is PsiWhiteSpace -> Regex("\\r\\n|[\\n\\r\\u0085\\u2028\\u2029]| +").findAll(e.text).forEach { add(Tok(-1, it.value, e.startOffset + it.range.first, false)) }
                e is PsiComment -> {
                    val block = e.parent as? KtBlockExpression
                    val asToken = e.text.startsWith("/*") && block?.parent is KtFunctionLiteral && block.children.isEmpty()
                    add(Tok(index++, e.text, e.startOffset, asToken))
                }
                e is KtStringTemplateExpression -> add(Tok(index++, WhitespaceTombstones.replaceTrailingWhitespaceWithTombstone(e.text), e.startOffset, true))
                e.allChildren.isEmpty() -> if (e.text.isNotEmpty()) add(Tok(index++, e.text, e.startOffset, true))
                else -> e.allChildren.forEach(::visit)
            }
        }
        visit(root)
        add(Tok(index, "", root.source.length, true))
    }
    private fun isParamComment(tok: Tok) = tok.blockComment && tok.text.matches(Regex("/\\*[A-Za-z0-9\\s_\\-]+=\\s*\\*/"))
    private val tokens = buildList {
        var k = 0
        var before = mutableListOf<Tok>()
        outer@ while (k < toks.size) {
            while (!toks[k].isToken) {
                val tok = toks[k++]; before.add(tok)
                if (isParamComment(tok)) while (toks[k].newline) k++
            }
            val tok = toks[k++]
            val after = mutableListOf<Tok>()
            while (k < toks.size && !toks[k].isToken) {
                if (toks[k].blockComment && tok.text in setOf("(", "<", ".")) break
                if (toks[k].javadoc && tok.text == ";") break
                if (isParamComment(toks[k])) {
                    add(Token(before, tok, after)); before = mutableListOf(toks[k++])
                    while (toks[k].newline) k++
                    continue@outer
                }
                val next = toks[k++]; after.add(next)
                if ('\n' in next.text || '\r' in next.text) break
            }
            add(Token(before, tok, after)); before = mutableListOf()
        }
    }
    private val layout = LayoutBuilder()
    private val tokenOps = mutableListOf<TokenOp>()
    private var index = 0
    private var level = 0
    private var position = Int.MIN_VALUE
    private val blanks = mutableMapOf<Int, BlankLineWanted>()
    fun depth() = level
    fun checkClosed(previous: Int) { check(level == previous) { "Unclosed layout: $level, expected $previous" } }
    fun diagnostic(message: String) = "$position: $message"
    fun sync(offset: Int) {
        if (offset > position) {
            position = offset
            val next = tokens.getOrNull(index)?.tok
            if (next != null && next.position < offset) throw FormattingError(diagnostic("did not generate token '${next.text}'"))
        }
    }
    fun open(indent: Indent) { layout.open(indent); level++ }
    fun close() { layout.close(); level--; check(level >= 0) }
    fun space() = layout.space()
    fun breakOp() = breakOp(FillMode.UNIFIED, "", Indent.Const.ZERO)
    fun breakOp(flat: String) = breakOp(FillMode.UNIFIED, flat, Indent.Const.ZERO)
    fun breakOp(indent: Indent) = breakOp(FillMode.UNIFIED, "", indent)
    fun breakOp(mode: FillMode, flat: String, indent: Indent, tag: Optional<Output.BreakTag> = Optional.empty()) { layout.ops.add(LayoutOp.Break(mode, flat, indent, tag.getOrNull())) }
    fun forcedBreak(indent: Indent = Indent.Const.ZERO) = breakOp(FillMode.FORCED, "", indent)
    fun breakToFill(flat: String = "") = breakOp(FillMode.INDEPENDENT, flat, Indent.Const.ZERO)
    fun peekToken(skip: Int = 0): Optional<String> = Optional.ofNullable(tokens.getOrNull(index + skip)?.tok?.text)
    fun guessToken(text: String) = token(text, Doc.Token.RealOrImaginary.IMAGINARY, Indent.Const.ZERO, Optional.empty())
    fun token(text: String, real: Doc.Token.RealOrImaginary, indent: Indent, trailing: Optional<Indent>) {
        if (peekToken().getOrNull() != text) {
            if (real == Doc.Token.RealOrImaginary.REAL) throw FormattingError(diagnostic("expected '${peekToken().getOrNull()}', generated '$text'"))
            return
        }
        emit(tokens[index++], true, indent, trailing.getOrNull())
    }
    private fun emit(token: Token, real: Boolean, indent: Indent, trailing: Indent?) {
        tokenOps.add(TokenOp(layout.ops.size, token, real, indent, trailing))
        layout.ops.add(LayoutOp.Text(token.tok.text, token.tok.index))
    }
    fun drain() { while (index < tokens.size) emit(tokens[index++], false, Indent.Const.ZERO, null); checkClosed(0) }
    fun markForPartialFormat() { /* Whole-document API does not request partial replacement boundaries. */ }
    fun blankLineWanted(value: BlankLineWanted) {
        val token = tokens[index]
        blank(token.before.firstOrNull { it.index >= 0 }?.index ?: token.tok.index, value)
    }
    private fun blank(k: Int, value: BlankLineWanted) { blanks[k] = blanks[k]?.merge(value) ?: value }
    fun fenceComments() { layout.open(); layout.close() }
    fun actualSize(offset: Int, length: Int): Int {
        fun containing(pos: Int) = tokens.first { t -> pos >= (t.before.firstOrNull()?.position ?: t.tok.position) && pos < (t.after.lastOrNull()?.let { it.position + it.text.length } ?: (t.tok.position + t.tok.text.length)) }
        val first = containing(offset); val last = containing(offset + length - 1)
        val start = (first.before.filter { it.comment }.map { it.position } + first.tok.position).min()
        val end = (last.after.filter { it.comment }.map { it.position + it.text.length } + (last.tok.position + last.tok.text.length)).max()
        return end - start
    }
    fun actualStartColumn(offset: Int): Int = tokens.first { it.tok.position == offset }.let { t ->
        val line = root.source.substring(0, offset).count { it == '\n' }
        var start = offset
        for (tok in t.before) {
            if (root.source.substring(0, tok.position).count { it == '\n' } != line) break
            if (tok.comment) start = minOf(start, tok.position)
        }
        start
    }
    fun render(width: Int): String {
        val ops = layout.ops.toList()
        val insertions = mutableMapOf<Int, MutableList<LayoutOp>>()
        fun insert(at: Int, op: LayoutOp) { insertions.getOrPut(at) { mutableListOf() }.add(op) }
        fun br(at: Int, mode: FillMode = FillMode.FORCED, indent: Indent = Indent.Const.ZERO) = insert(at, LayoutOp.Break(mode, "", indent, null))
        fun comment(at: Int, tok: Tok) {
            insert(at, LayoutOp.Comment(tok.text, tok.index))
            if (!tok.blockComment) br(at)
        }
        for (event in tokenOps) {
            var j = event.position
            while (j > 0 && ops[j - 1] is LayoutOp.Open) j--
            var k = event.position
            while (k + 1 < ops.size && ops[k + 1] == LayoutOp.Close) k++
            val token = event.token
            if (event.real) {
                var newlines = 0; var space = false; var lastWasComment = false; var allowBlank = false
                for (tok in token.before) {
                    if (tok.newline) newlines++
                    else if (tok.comment) {
                        br(j, if (tok.lineComment) FillMode.FORCED else FillMode.UNIFIED, event.indent)
                        comment(j, tok)
                        space = tok.blockComment; newlines = 0; lastWasComment = true
                        if (tok.javadoc) br(j)
                        allowBlank = tok.lineComment || (tok.blockComment && !tok.javadoc)
                    }
                }
                if (allowBlank && newlines > 1) blank(token.tok.index, BlankLineWanted.YES)
                if (lastWasComment && newlines > 0) br(j) else if (space) insert(j, LayoutOp.Text(" "))
                for (tok in token.after) if (tok.comment) {
                    val breakAfter = tok.javadoc || (tok.blockComment && event.trailing != null)
                    if (breakAfter) br(k + 1, indent = event.trailing ?: Indent.Const.ZERO) else insert(k + 1, LayoutOp.Text(" "))
                    comment(k + 1, tok)
                    if (breakAfter) br(k + 1)
                }
            } else {
                var newlines = 0; var lastWasComment = false
                for (tok in token.before) {
                    if (tok.newline) newlines++ else if (tok.comment) { newlines = 0; lastWasComment = true }
                    if (lastWasComment && newlines > 0) br(j)
                    insert(j, LayoutOp.Comment(tok.text, tok.index))
                }
                token.after.forEach { insert(k + 1, LayoutOp.Comment(it.text, it.index)) }
            }
        }
        layout.ops.clear()
        var afterForced = false
        fun forced(op: LayoutOp) = op is LayoutOp.Break && op.mode == FillMode.FORCED
        for (i in 0..ops.size) {
            for (op in insertions[i].orEmpty()) {
                if (!(afterForced && op is LayoutOp.Text && op.value == " " && op.index < 0)) { layout.ops.add(op); afterForced = forced(op) }
            }
            if (i == ops.size) break
            val op = ops[i]
            if (afterForced && ((op is LayoutOp.Text && op.value == " " && op.index < 0) || (op is LayoutOp.Break && op.indent.eval() == 0 && op.flat == " "))) continue
            layout.ops.add(op)
            if (op !is LayoutOp.Open) afterForced = forced(op)
        }
        var start = 0
        var firstTok = 0
        val ranges = root.source.split('\n').map { line ->
            val end = start + line.length
            while (firstTok < toks.size && toks[firstTok].position + toks[firstTok].text.length <= start) firstTok++
            var cursor = firstTok
            var first = -1
            var last = -1
            while (cursor < toks.size && toks[cursor].position <= end) {
                val tok = toks[cursor++]
                if (tok.index >= 0) { if (first < 0) first = tok.index; last = tok.index }
            }
            start = end + 1
            if (first < 0) IntRange.EMPTY else first..last
        }
        return layout.render(width, LayoutOutput(ranges, blanks))
    }
    abstract class BlankLineWanted {
        abstract fun wanted(): Optional<Boolean>
        abstract fun merge(other: BlankLineWanted): BlankLineWanted
        private class Simple(val value: Boolean?) : BlankLineWanted() {
            override fun wanted() = Optional.ofNullable(value)
            override fun merge(other: BlankLineWanted) = this
        }
        private class Conditional(val tags: List<Output.BreakTag>) : BlankLineWanted() {
            override fun wanted() = Optional.ofNullable(if (tags.any { it.taken }) true else null)
            override fun merge(other: BlankLineWanted) = if (other is Conditional) Conditional(tags + other.tags) else other
        }
        companion object {
            val YES: BlankLineWanted = Simple(true)
            val NO: BlankLineWanted = Simple(false)
            val PRESERVE: BlankLineWanted = Simple(null)
            fun conditional(tag: Output.BreakTag): BlankLineWanted = Conditional(listOf(tag))
        }
    }
}
