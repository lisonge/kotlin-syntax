package li.songe.kotlin.builder

import kotlin.test.Test
import kotlin.test.assertEquals
import org.jetbrains.kotlin.parsing.SemanticWhitespaceAwarePsiBuilderImpl

class SemanticBuilderOracleTest {
    @Test fun matchesOfficialAdapter() {
        val sources = listOf("", "a?.b ?: c!!", "? . ? : ! !", "a\n/* comment */b", "a/*\n*/b", "a\r\nb",
            "#!/bin/kotlin\na", "a // tail\n", "!!?.?:", "a /* c */ ?. b", "a\n\n/** doc */ b")
        for (source in sources) for (join in listOf(true, false)) for (newline in listOf(true, false)) {
            OfficialBuilder.withBuilder(source) { base ->
                val native = SemanticWhitespaceAwarePsiBuilderImpl(base)
                val portable = SemanticBuilder(SyntaxBuilder(source))
                val nativeRoot = native.mark()
                val portableRoot = portable.delegate.mark()
                if (!join) { native.disableJoiningComplexTokens(); portable.disableJoiningComplexTokens() }
                if (!newline) { native.disableNewlines(); portable.disableNewlines() }
                do {
                    val label = "$source / joining=$join / newlines=$newline / offset=${base.currentOffset}"
                    assertEquals(native.tokenType?.toString(), portable.tokenType?.let { OfficialBuilder.type(it).toString() }, label)
                    assertEquals(native.tokenText, portable.tokenText, label)
                    assertEquals(native.newlineBeforeCurrentToken(), portable.newlineBeforeCurrentToken(), label)
                    for (i in 0..3) assertEquals(native.lookAhead(i)?.toString(), portable.lookAhead(i)?.let { OfficialBuilder.type(it).toString() }, "$label lookAhead($i)")
                    if (base.eof()) break
                    native.advanceLexer(); portable.advanceLexer()
                } while (true)
                if (!join) { native.restoreJoiningComplexTokensState(); portable.restoreJoiningComplexTokensState() }
                if (!newline) { native.restoreNewlinesState(); portable.restoreNewlinesState() }
                assertEquals(native.newlineBeforeCurrentToken(), portable.newlineBeforeCurrentToken())
                nativeRoot.done(OfficialBuilder.type("ROOT")); portableRoot.done("ROOT")
                assertEquals(OfficialBuilder.tree(base.lightTree), OfficialBuilder.normalize(portable.delegate.buildTree()))
            }
        }
    }
}
