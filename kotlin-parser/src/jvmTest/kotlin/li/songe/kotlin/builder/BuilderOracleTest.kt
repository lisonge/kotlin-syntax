package li.songe.kotlin.builder

import org.jetbrains.kotlin.com.intellij.lang.PsiBuilder
import org.jetbrains.kotlin.com.intellij.lang.WhitespacesAndCommentsBinder
import org.jetbrains.kotlin.com.intellij.lang.WhitespacesBinders
import org.jetbrains.kotlin.parsing.*
import kotlin.test.Test
import kotlin.test.assertEquals

class BuilderOracleTest {
    private fun binder(value: String): WhitespacesAndCommentsBinder = when (TriviaBinder.valueOf(value)) {
        TriviaBinder.LEFT_EDGE -> WhitespacesBinders.GREEDY_LEFT_BINDER
        TriviaBinder.RIGHT_EDGE -> WhitespacesBinders.GREEDY_RIGHT_BINDER
        TriviaBinder.PRECEDING_COMMENTS -> PrecedingCommentsBinder
        TriviaBinder.PRECEDING_DOC -> PrecedingDocCommentsBinder
        TriviaBinder.TRAILING_COMMENTS -> TrailingCommentsBinder
        TriviaBinder.PRECEDING_ALL_COMMENTS -> PRECEDING_ALL_COMMENTS_BINDER
        TriviaBinder.TRAILING_ALL_COMMENTS -> TRAILING_ALL_COMMENTS_BINDER
        TriviaBinder.FIRST_SHEBANG -> BindFirstShebangWithWhitespaceOnly
    }
    @Test fun matchesOfficialMarkerOperations() {
        for (case in BuilderScenarios.all) OfficialBuilder.withBuilder(case.source) { b ->
            val markers = mutableMapOf<String, PsiBuilder.Marker>()
            for (s in case.steps) when (s.op) {
                "mark" -> markers[s.id] = b.mark()
                "advance" -> b.advanceLexer()
                "consume" -> while (!b.eof()) b.advanceLexer()
                "remap" -> b.remapCurrentToken(OfficialBuilder.type(s.value))
                "done" -> markers.getValue(s.id).done(OfficialBuilder.type(s.value))
                "collapse" -> markers.getValue(s.id).collapse(OfficialBuilder.type(s.value))
                "drop" -> markers.getValue(s.id).drop()
                "rollback" -> markers.getValue(s.id).rollbackTo()
                "precede" -> markers[s.id] = markers.getValue(s.other).precede()
                "error" -> markers.getValue(s.id).error(s.value)
                "pointError" -> b.error(s.value)
                "doneBefore" -> markers.getValue(s.id).doneBefore(OfficialBuilder.type(s.value), markers.getValue(s.other))
                "errorBefore" -> markers.getValue(s.id).errorBefore(s.value, markers.getValue(s.other))
                "bind" -> markers.getValue(s.id).setCustomEdgeTokenBinders(binder(s.value), binder(s.other))
                else -> error(s.op)
            }
            assertEquals(OfficialBuilder.tree(b.lightTree), OfficialBuilder.normalize(BuilderScenarios.runPortable(case)), case.name)
        }
        println("Compared ${BuilderScenarios.all.size} marker/trivia scenarios with official PsiBuilder")
    }
}
