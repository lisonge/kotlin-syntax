package com.google.googlejavaformat

import com.google.common.collect.ImmutableList
import com.google.common.collect.Range
import java.util.Optional
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import li.songe.kotlin.format.engine.LayoutBuilder
import li.songe.kotlin.format.engine.LayoutOp
import li.songe.kotlin.format.engine.LayoutOutput
import li.songe.kotlin.format.engine.Indent as PortableIndent
import li.songe.kotlin.format.engine.FillMode as PortableFillMode
import li.songe.kotlin.format.engine.BreakTag as PortableBreakTag

/** Test the port against the real 1.23.0 DocBuilder/Doc/Indent, independently of Kotlin visitors. */
class LayoutDifferentialTest {
    @Test fun nestedLevelsAndConditionalBreaks() {
        for (seed in 0 until 100) for (width in listOf(8, 16, 40, 100)) {
            val random = Random(seed)
            val layout = LayoutBuilder()
            val tag = PortableBreakTag()
            layout.text("call(")
            layout.open(PortableIndent.If(tag, PortableIndent.Const(4), PortableIndent.Const(2)))
            layout.breakOp(PortableFillMode.UNIFIED, "", tag = tag)
            fun group(depth: Int) {
                repeat(4) {
                    layout.text("x".repeat(random.nextInt(1, 13)))
                    if (depth > 0 && random.nextBoolean()) {
                        layout.text("("); layout.open(random.nextInt(0, 5))
                        layout.breakOp(PortableFillMode.UNIFIED)
                        group(depth - 1)
                        layout.close(); layout.text(")")
                    }
                    layout.text(",")
                    layout.breakOp(PortableFillMode.entries[random.nextInt(3)], " ", random.nextInt(-1, 3))
                }
            }
            group(2)
            layout.close(); layout.text(")")
            val tags = mutableMapOf<PortableBreakTag, Output.BreakTag>()
            fun tag(t: PortableBreakTag) = tags.getOrPut(t) { Output.BreakTag() }
            fun indent(i: PortableIndent): Indent = when (i) {
                is PortableIndent.Const -> Indent.Const.make(i.value, 1)
                is PortableIndent.If -> Indent.If.make(tag(i.tag), indent(i.yes), indent(i.no))
            }
            var index = 0
            val ops = layout.ops.map { op -> when (op) {
                is LayoutOp.Open -> OpenOp.make(indent(op.indent))
                LayoutOp.Close -> CloseOp.make()
                is LayoutOp.Break -> Doc.Break.make(Doc.FillMode.valueOf(op.mode.name), op.flat, indent(op.indent), Optional.ofNullable(op.tag?.let(::tag)))
                is LayoutOp.Text -> {
                    val tok = TextTok(op.value, index++)
                    val token = object : Input.Token {
                        override fun getTok() = tok
                        override fun getToksBefore(): ImmutableList<Input.Tok> = ImmutableList.of()
                        override fun getToksAfter(): ImmutableList<Input.Tok> = ImmutableList.of()
                    }
                    Doc.Token.make(token, Doc.Token.RealOrImaginary.REAL, Indent.Const.ZERO, Optional.empty())
                }
                is LayoutOp.Comment -> error("Comments are covered by ktfmt differential tests")
            } }
            val writer = LayoutOutput(emptyList(), emptyMap())
            val comments = CommentsHelper { tok, _, _ -> tok.originalText }
            val output = object : Output() {
                override fun indent(indent: Int) = writer.indent(indent)
                override fun append(text: String, range: Range<Int>) = writer.append(text)
                override fun blankLine(k: Int, wanted: OpsBuilder.BlankLineWanted) {}
                override fun markForPartialFormat(start: Input.Token, end: Input.Token) {}
                override fun getCommentsHelper() = comments
            }
            val doc = DocBuilder().withOps(ops).build()
            doc.computeBreaks(comments, width, Doc.State(0, 0))
            doc.write(output)
            assertEquals(writer.finish(), layout.render(width, LayoutOutput(emptyList(), emptyMap())), "seed=$seed width=$width")
        }
    }
    private class TextTok(private val text: String, private val index: Int) : Input.Tok {
        override fun getIndex() = index
        override fun getPosition() = index
        override fun getColumn() = 0
        override fun getText() = text
        override fun getOriginalText() = text
        override fun length() = text.length
        override fun isNewline() = false
        override fun isSlashSlashComment() = false
        override fun isSlashStarComment() = false
        override fun isJavadocComment() = false
        override fun isComment() = false
    }
}
