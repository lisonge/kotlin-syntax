/* Copyright 2015 Google Inc. Licensed under Apache-2.0.
 * Whole-document output emission from google-java-format 1.23.0 JavaOutput.
 */
package li.songe.kotlin.format.engine

internal class LayoutOutput(
    private val inputRanges: List<IntRange>,
    private val blanks: Map<Int, OpsBuilder.BlankLineWanted>,
) {
    private val lines = mutableListOf<String>()
    private var inputLine = 0
    private var lastK = -1
    private var newlinesPending = 0
    private var line = StringBuilder()
    private var spaces = StringBuilder()
    fun append(text: String, first: Int = -1, last: Int = -1) {
        if (first >= 0) {
            var sawNewlines = false
            while (inputLine < inputRanges.size && (inputRanges[inputLine].isEmpty() || inputRanges[inputLine].last < first)) {
                if (inputRanges[inputLine].isEmpty()) sawNewlines = true
                inputLine++
            }
            val wanted = blanks[lastK] ?: OpsBuilder.BlankLineWanted.NO
            if ((sawNewlines && (text.startsWith("//") || text.startsWith("/*"))) || wanted.wanted().getOrNull() ?: sawNewlines) newlinesPending++
        }
        if (text == "\n" || text == "\r" || text == "\r\n") {
            if (newlinesPending == 0) newlinesPending++
            spaces.clear()
        } else {
            var i = 0
            while (i < text.length) {
                when (val c = text[i++]) {
                    ' ', '\t' -> spaces.append(c)
                    '\r', '\n' -> {
                        if (c == '\r' && i < text.length && text[i] == '\n') i++
                        spaces.clear(); newlinesPending++
                    }
                    else -> {
                        while (newlinesPending > 0) {
                            if (lines.isNotEmpty() || line.isNotEmpty()) lines.add(line.toString())
                            line = StringBuilder(); newlinesPending--
                        }
                        line.append(spaces); spaces.clear(); line.append(c)
                    }
                }
            }
        }
        if (first >= 0) lastK = last
    }
    fun indent(value: Int) { repeat(value) { spaces.append(' ') } }
    fun finish(): String {
        if (line.isNotBlank()) lines.add(line.toString())
        return if (lines.isEmpty()) "" else lines.joinToString("\n", postfix = "\n")
    }
}
