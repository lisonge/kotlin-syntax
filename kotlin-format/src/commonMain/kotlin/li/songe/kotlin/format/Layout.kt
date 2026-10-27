/*
 * Copyright 2015 Google Inc.
 * Licensed under the Apache License, Version 2.0.
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Portable implementation of google-java-format 1.23.0 LayoutDoc, DocBuilder and Indent.
 * The level flattening and break selection follow the upstream algorithm.
 */
package li.songe.kotlin.format.engine
import li.songe.kotlin.format.upstream.kdoc.KDocCommentsHelper
import li.songe.kotlin.format.upstream.kdoc.Tok

open class BreakTag {
    var taken = false
}

sealed interface Indent {
    fun eval(): Int
    data class Const(val value: Int) : Indent { override fun eval() = value; companion object { val ZERO = Const(0); fun make(n: Int, multiplier: Int) = Const(n * multiplier) } }
    data class If(val tag: BreakTag, val yes: Indent, val no: Indent) : Indent {
        override fun eval() = if (tag.taken) yes.eval() else no.eval()
        companion object { fun make(tag: BreakTag, yes: Indent, no: Indent) = If(tag, yes, no) }
    }
}

enum class FillMode { UNIFIED, INDEPENDENT, FORCED }

internal sealed interface LayoutOp {
    data class Open(val indent: Indent) : LayoutOp
    data object Close : LayoutOp
    data class Text(val value: String, val index: Int = -1) : LayoutOp
    data class Comment(val value: String, val index: Int) : LayoutOp
    data class Break(val mode: FillMode, val flat: String, val indent: Indent, val tag: BreakTag?) : LayoutOp
}

internal class LayoutBuilder {
    val ops = mutableListOf<LayoutOp>()
    fun open(indent: Int = 0) { ops.add(LayoutOp.Open(Indent.Const(indent))) }
    fun open(indent: Indent) { ops.add(LayoutOp.Open(indent)) }
    fun close() { ops.add(LayoutOp.Close) }
    fun text(value: String) { if (value.isNotEmpty()) ops.add(LayoutOp.Text(value)) }
    fun space() = text(" ")
    fun breakOp(mode: FillMode = FillMode.UNIFIED, flat: String = "", indent: Int = 0, tag: BreakTag? = null) {
        ops.add(LayoutOp.Break(mode, flat, Indent.Const(indent), tag))
    }
    fun forcedBreak(indent: Int = 0) = breakOp(FillMode.FORCED, "", indent)
    fun render(width: Int, output: LayoutOutput): String {
        val root = Level(Indent.Const(0))
        val stack = mutableListOf(root)
        var appendLevel = root
        for (op in ops) when (op) {
            is LayoutOp.Open -> stack.add(Level(op.indent))
            LayoutOp.Close -> {
                check(stack.size > 1) { "Unbalanced layout close" }
                val level = stack.removeAt(stack.lastIndex)
                stack.last().docs.add(level)
            }
            is LayoutOp.Text -> appendLevel.docs.add(Text(op.value, op.index))
            is LayoutOp.Comment -> appendLevel.docs.add(Comment(op.value, op.index, KDocCommentsHelper("\n", width)))
            is LayoutOp.Break -> {
                appendLevel = stack.last()
                appendLevel.docs.add(Break(op.mode, op.flat, op.indent, op.tag))
            }
        }
        check(stack.size == 1) { "Unclosed layout levels" }
        root.computeBreaks(width, State(0, 0))
        root.write(output)
        return output.finish()
    }
}

private const val MAX_LINE_WIDTH = 1000
private data class State(val indent: Int, val column: Int, val mustBreak: Boolean = false)
private sealed class LayoutDoc {
    val width: Int by lazy { computeWidth() }
    abstract fun computeWidth(): Int
    abstract fun flat(): String
    abstract fun computeBreaks(maxWidth: Int, state: State): State
    open val first: Int get() = -1
    open val last: Int get() = -1
    abstract fun write(out: LayoutOutput)
}
private class Text(val value: String, val index: Int) : LayoutDoc() {
    override val first get() = index
    override val last get() = if (index >= 0) index + 1 else -1
    override fun computeWidth() = if ('\n' in value || '\r' in value) MAX_LINE_WIDTH else value.length
    override fun flat() = value
    override fun computeBreaks(maxWidth: Int, state: State) = state.copy(column = state.column + width)
    override fun write(out: LayoutOutput) { out.append(value, first, last) }
}
private class Comment(val value: String, val index: Int, val helper: KDocCommentsHelper) : LayoutDoc() {
    override val first get() = index
    override val last get() = index + 1
    private var rewritten = value
    private fun parameter(): String? {
        if (!value.startsWith("/*") || !value.endsWith("*/")) return null
        val body = value.substring(2, value.length - 2).trim()
        if (!body.endsWith('=')) return null
        val name = body.dropLast(1).trim()
        val identifier = name.removeSuffix("...")
        if (identifier.isEmpty() || !(identifier[0].isLetter() || identifier[0] in "_$") || identifier.any { !it.isLetterOrDigit() && it !in "_$" }) return null
        return "/* $name= */"
    }
    override fun flat(): String = if (value.startsWith("//") && !value.startsWith("// ")) "// " + value.substring(2) else parameter() ?: value
    override fun computeWidth(): Int {
        val newline = value.indexOfFirst { it == '\n' || it == '\r' }
        if (!Tok(value).isComment) return if (newline >= 0) MAX_LINE_WIDTH else value.length
        return if (newline > 0) newline else flat().length
    }
    override fun computeBreaks(maxWidth: Int, state: State): State {
        rewritten = helper.rewrite(Tok(value), maxWidth, state.column)
        return state.copy(column = state.column + rewritten.substringAfterLast('\n').length)
    }
    override fun write(out: LayoutOutput) { out.append(rewritten, first, last) }
}
private class Break(val mode: FillMode, val value: String, val indent: Indent, val tag: BreakTag?) : LayoutDoc() {
    var broken = false
    var newIndent = -1
    override fun computeWidth() = if (mode == FillMode.FORCED) MAX_LINE_WIDTH else value.length
    override fun flat() = value
    fun computeBreaks(state: State, take: Boolean): State {
        tag?.taken = take
        broken = take
        newIndent = if (take) (state.indent + indent.eval()).coerceAtLeast(0) else -1
        return state.copy(column = if (take) newIndent else state.column + value.length)
    }
    override fun computeBreaks(maxWidth: Int, state: State): State = error("Break requires its enclosing level")
    override fun write(out: LayoutOutput) {
        if (broken) { out.append("\n"); out.indent(newIndent) }
        else out.append(value)
    }
}
private class Level(val indent: Indent) : LayoutDoc() {
    val docs = mutableListOf<LayoutDoc>()
    private var oneLine = false
    private val splits = mutableListOf<MutableList<LayoutDoc>>()
    private val breaks = mutableListOf<Break>()
    override val first get() = docs.firstOrNull { it.first >= 0 }?.first ?: -1
    override val last get() = docs.lastOrNull { it.last >= 0 }?.last ?: -1
    override fun computeWidth() = widthOf(docs)
    override fun flat() = docs.joinToString("") { it.flat() }
    override fun computeBreaks(maxWidth: Int, state: State): State {
        if (state.column + width <= maxWidth) {
            oneLine = true
            return state.copy(column = state.column + width)
        }
        splits.clear(); breaks.clear(); splits.add(mutableListOf())
        for (doc in docs) {
            if (doc is Break) { breaks.add(doc); splits.add(mutableListOf()) }
            else splits.last().add(doc)
        }
        var broken = State(state.indent + indent.eval(), state.column)
        for (i in splits.indices) {
            val breakDoc = if (i == 0) null else breaks[i - 1]
            val split = splits[i]
            val splitWidth = widthOf(split)
            val shouldBreak = breakDoc?.mode == FillMode.UNIFIED || broken.mustBreak ||
                broken.column + (breakDoc?.width ?: 0) + splitWidth > maxWidth
            if (breakDoc != null) broken = breakDoc.computeBreaks(broken, shouldBreak)
            val enoughRoom = broken.column + splitWidth <= maxWidth
            broken = broken.copy(mustBreak = false)
            for (doc in split) broken = doc.computeBreaks(maxWidth, broken)
            if (!enoughRoom) broken = broken.copy(mustBreak = true)
        }
        return state.copy(column = broken.column)
    }
    override fun write(out: LayoutOutput) {
        if (oneLine) out.append(flat(), first, last)
        else for (i in splits.indices) {
            if (i > 0) breaks[i - 1].write(out)
            for (doc in splits[i]) doc.write(out)
        }
    }
}
private fun widthOf(docs: List<LayoutDoc>): Int {
    var width = 0
    for (doc in docs) { width += doc.width; if (width >= MAX_LINE_WIDTH) return MAX_LINE_WIDTH }
    return width
}
