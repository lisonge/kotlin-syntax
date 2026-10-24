package li.songe.kotlin.builder

import li.songe.kotlin.tree.SyntaxNode

data class BuilderStep(val op: String, val id: String = "", val value: String = "", val other: String = "")
data class BuilderScenario(val name: String, val source: String, val steps: List<BuilderStep>)

object BuilderScenarios {
    private fun s(op: String, id: String = "", value: String = "", other: String = "") = BuilderStep(op, id, value, other)
    val all: List<BuilderScenario> = buildList {
        val nested = listOf(s("mark", "root"), s("mark", "expr"), s("mark", "lhs"), s("advance"), s("done", "lhs", "REFERENCE_EXPRESSION"),
            s("advance"), s("mark", "rhs"), s("advance"), s("done", "rhs", "REFERENCE_EXPRESSION"), s("done", "expr", "BINARY_EXPRESSION"), s("consume"), s("done", "root", "ROOT"))
        for (trivia in listOf(" ", "\t\n", " /* c */ ", "\n// c\n", "\n/** doc */\n", "\n\n// c\n")) {
            add(BuilderScenario("nested-$trivia", trivia + "a" + trivia + "+" + trivia + "b" + trivia, nested))
            add(BuilderScenario("precede-$trivia", "a${trivia}+${trivia}b", listOf(s("mark", "root"), s("mark", "lhs"), s("advance"),
                s("done", "lhs", "REFERENCE_EXPRESSION"), s("precede", "expr", other = "lhs"), s("advance"), s("mark", "rhs"), s("advance"),
                s("done", "rhs", "REFERENCE_EXPRESSION"), s("done", "expr", "BINARY_EXPRESSION"), s("done", "root", "ROOT"))))
        }
        add(BuilderScenario("rollback-remap", "field + x", listOf(s("mark", "root"), s("mark", "attempt"), s("remap", value = "FIELD_KEYWORD"), s("advance"),
            s("mark", "discard"), s("advance"), s("done", "discard", "DISCARDED"), s("rollback", "attempt"), s("consume"), s("done", "root", "ROOT"))))
        add(BuilderScenario("drop-parent", "a b", listOf(s("mark", "root"), s("mark", "drop"), s("mark", "child"), s("advance"), s("done", "child", "REFERENCE_EXPRESSION"),
            s("drop", "drop"), s("consume"), s("done", "root", "ROOT"))))
        add(BuilderScenario("collapse", "a + b", listOf(s("mark", "root"), s("mark", "collapsed"), s("mark", "child"), s("advance"), s("done", "child", "REFERENCE_EXPRESSION"),
            s("consume"), s("collapse", "collapsed", "COLLAPSED"), s("done", "root", "ROOT"))))
        add(BuilderScenario("done-before", "a b", listOf(s("mark", "root"), s("mark", "a"), s("advance"), s("mark", "b"), s("doneBefore", "a", "A", "b"),
            s("advance"), s("done", "b", "B"), s("done", "root", "ROOT"))))
        add(BuilderScenario("errors", "a ? b", listOf(s("mark", "root"), s("advance"), s("pointError", value = "missing"), s("pointError", value = "duplicate"),
            s("mark", "bad"), s("advance"), s("error", "bad", "unexpected"), s("consume"), s("done", "root", "ROOT"))))
        add(BuilderScenario("error-before", "a b", listOf(s("mark", "root"), s("mark", "a"), s("advance"), s("mark", "b"), s("errorBefore", "a", "unexpected", "b"),
            s("advance"), s("done", "b", "B"), s("done", "root", "ROOT"))))
        add(BuilderScenario("deepest-point-error", "a ", listOf(s("mark", "root"), s("mark", "child"), s("advance"),
            s("pointError", value = "inner"), s("done", "child", "CHILD"), s("pointError", value = "outer"), s("consume"), s("done", "root", "ROOT"))))
        // Deterministic mixed operations exercise links after middle removal and suffix rollback.
        for (seed in 0..23) {
            val random = kotlin.random.Random(seed)
            val steps = mutableListOf(s("mark", "root"))
            repeat(if (seed == 23) 2048 else 64) { i ->
                val a = "a$i"; val b = "b$i"
                when (random.nextInt(6)) {
                    0 -> steps.addAll(listOf(s("mark", a), s("mark", b), s("remap", value = "FIELD_KEYWORD"), s("advance"),
                        s("done", b, "REFERENCE_EXPRESSION"), s("rollback", a), s("mark", a), s("advance"), s("done", a, "REFERENCE_EXPRESSION")))
                    1 -> steps.addAll(listOf(s("mark", a), s("advance"), s("done", a, "REFERENCE_EXPRESSION"),
                        s("precede", b, other = a), s("done", b, "WRAPPER"), s("drop", b)))
                    2 -> steps.addAll(listOf(s("mark", a), s("mark", b), s("advance"), s("done", b, "REFERENCE_EXPRESSION"), s("drop", a)))
                    3 -> steps.addAll(listOf(s("mark", a), s("mark", b), s("advance"), s("done", b, "REFERENCE_EXPRESSION"),
                        s("done", a, "WRAPPER"), s("drop", a)))
                    4 -> steps.addAll(listOf(s("mark", a), s("advance"), s("mark", b), s("doneBefore", a, "REFERENCE_EXPRESSION", b), s("drop", b)))
                    5 -> steps.addAll(listOf(s("mark", a), s("mark", b), s("advance"), s("done", b, "REFERENCE_EXPRESSION"), s("collapse", a, "COLLAPSED")))
                }
            }
            steps.addAll(listOf(s("consume"), s("done", "root", "ROOT")))
            add(BuilderScenario("mixed-links-$seed", "field /* trivia */\n".repeat(if (seed == 23) 2048 else 64), steps))
        }
        for (left in TriviaBinder.entries) for (right in TriviaBinder.entries) {
            add(BuilderScenario("bind-$left-$right", "\n/** doc */\n// before\na /* after */\n ", listOf(s("mark", "root"), s("mark", "node"), s("advance"),
                s("done", "node", "NODE"), s("bind", "node", left.name, right.name), s("consume"), s("done", "root", "ROOT"))))
        }
        for (source in listOf("", "  ", "// comment\n", "#!/usr/bin/env kotlin\n// header\n")) {
            add(BuilderScenario("empty-$source", source, listOf(s("mark", "root"), s("mark", "empty"), s("done", "empty", "EMPTY"), s("consume"), s("done", "root", "ROOT"))))
        }
    }

    fun runPortable(case: BuilderScenario): SyntaxNode {
        val builder = SyntaxBuilder(case.source)
        val markers = mutableMapOf<String, SyntaxBuilder.Marker>()
        for (s in case.steps) when (s.op) {
            "mark" -> markers[s.id] = builder.mark()
            "advance" -> builder.advanceLexer()
            "consume" -> while (!builder.eof()) builder.advanceLexer()
            "remap" -> builder.remapCurrentToken(s.value)
            "done" -> markers.getValue(s.id).done(s.value)
            "collapse" -> markers.getValue(s.id).collapse(s.value)
            "drop" -> markers.getValue(s.id).drop()
            "rollback" -> markers.getValue(s.id).rollbackTo()
            "precede" -> markers[s.id] = markers.getValue(s.other).precede()
            "error" -> markers.getValue(s.id).error(s.value)
            "pointError" -> builder.error(s.value)
            "doneBefore" -> markers.getValue(s.id).doneBefore(s.value, markers.getValue(s.other))
            "errorBefore" -> markers.getValue(s.id).errorBefore(s.value, markers.getValue(s.other))
            "bind" -> markers.getValue(s.id).setCustomEdgeTokenBinders(TriviaBinder.valueOf(s.value), TriviaBinder.valueOf(s.other))
            else -> error("Unknown operation ${s.op}")
        }
        return try { builder.buildTree() } catch (e: Exception) { throw IllegalStateException(case.name, e) }
    }
}
