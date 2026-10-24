package li.songe.kotlin.builder

import li.songe.kotlin.lexer.Token
import li.songe.kotlin.lexer.tokenize
import li.songe.kotlin.tree.SyntaxNode

/** Marker-based builder for the non-lazy parser. Does not create PSI or perform type resolution. */
class SyntaxBuilder(val source: String) {
    private val tokens = tokenize(source).toMutableList()
    private var cursor = 0
    private var built = false
    // Marker handles own their event links: append, precede and drop do not scan
    // the accumulated production history. Freeze into an array once for trivia binding.
    private var firstEvent: Event? = null
    private var lastEvent: Event? = null
    internal class Event(val marker: SyntaxBuilder.Marker?, val close: Boolean, var index: Int, val message: String? = null) {
        var previous: Event? = null
        var next: Event? = null
    }
    private fun insert(event: Event, before: Event? = null) {
        val previous = if (before == null) lastEvent else before.previous
        event.previous = previous; event.next = before
        if (previous == null) firstEvent = event else previous.next = event
        if (before == null) lastEvent = event else before.previous = event
    }
    private fun remove(event: Event) {
        val previous = event.previous; val next = event.next
        if (previous == null) firstEvent = next else previous.next = next
        if (next == null) lastEvent = previous else next.previous = previous
        event.previous = null; event.next = null
    }

    private fun skip(index: Int): Int {
        var i = index
        while (i < tokens.size && isTrivia(tokens[i].kind)) i++
        return i
    }
    private fun readable() { check(!built) { "Builder has already produced a tree" } }
    val tokenType: String? get() { readable(); cursor = skip(cursor); return tokens.getOrNull(cursor)?.kind }
    val tokenText: String? get() { tokenType ?: return null; return tokens[cursor].let { source.substring(it.start, it.end) } }
    val currentOffset: Int get() { tokenType; return offset(cursor) }
    fun eof(): Boolean = tokenType == null
    fun advanceLexer() { if (!eof()) cursor++ }
    fun rawLookup(steps: Int): String? = tokens.getOrNull(cursor + steps)?.kind
    fun rawTokenTypeStart(steps: Int): Int = if (cursor + steps < 0) -1 else offset(cursor + steps)
    fun rawTokenIndex(): Int = cursor
    fun lookAhead(steps: Int): String? {
        require(steps >= 0)
        var i = skip(cursor)
        repeat(steps) { i = skip(i + 1) }
        return tokens.getOrNull(i)?.kind
    }
    fun lookAheadOffset(steps: Int): Int {
        require(steps >= 0)
        var i = skip(cursor)
        repeat(steps) { i = skip(i + 1) }
        return offset(i)
    }
    fun remapCurrentToken(kind: String) {
        readable()
        require(cursor < tokens.size)
        tokens[cursor] = tokens[cursor].copy(kind = kind)
    }
    fun mark(): Marker {
        readable()
        if (firstEvent != null) cursor = skip(cursor)
        return Marker(cursor).also { insert(it.open) }
    }
    fun error(message: String) {
        readable()
        if (lastEvent?.let { it.marker == null && it.index == cursor } == true) return
        insert(Event(null, false, cursor, message))
    }
    private fun offset(index: Int): Int = tokens.getOrNull(index)?.start ?: source.length

    inner class Marker internal constructor(index: Int) {
        internal val owner: SyntaxBuilder = this@SyntaxBuilder
        private var active = true
        internal var kind: String? = null
        internal var message: String? = null
        internal var collapsed = false
        internal var left = TriviaBinder.RIGHT_EDGE
        internal var right = TriviaBinder.LEFT_EDGE
        internal val open = Event(this, false, index)
        internal var close: Event? = null

        private fun valid() { readable(); check(active) { "Marker was dropped or rolled back" } }
        fun done(kind: String) = finish(kind, null, false, null)
        fun collapse(kind: String) = finish(kind, null, true, null)
        fun error(message: String) = finish("ERROR_ELEMENT", message, false, null)
        fun doneBefore(kind: String, before: Marker) = finish(kind, null, false, before)
        fun errorBefore(message: String, before: Marker) = finish("ERROR_ELEMENT", message, false, before)
        private fun finish(kind: String, message: String?, collapse: Boolean, before: Marker?) {
            valid(); check(close == null) { "Marker is already done" }
            if (before != null) { require(before.owner === owner); before.valid() }
            this.kind = kind; this.message = message; this.collapsed = collapse
            val end = Event(this, true, before?.open?.index ?: cursor)
            // These official KtNodeTypes have isLeftBound=true: an implicit empty
            // constructor delegation belongs before the following whitespace.
            if (kind in setOf("ERROR_ELEMENT", "CONSTRUCTOR_DELEGATION_CALL", "CONSTRUCTOR_DELEGATION_REFERENCE") &&
                (open.index until end.index).all { isTrivia(tokens[it].kind) }) left = TriviaBinder.LEFT_EDGE
            if (before != null) {
                var following = open.next
                while (following != null && following !== before.open) following = following.next
                check(following != null) { "Cannot finish before marker start" }
            }
            insert(end, before?.open); close = end
        }
        fun precede(): Marker {
            valid()
            return Marker(open.index).also { insert(it.open, open) }
        }
        fun drop() {
            valid()
            remove(open); close?.let { remove(it) }; active = false
        }
        fun rollbackTo() {
            valid()
            cursor = open.index
            var event: Event? = open
            while (event != null) {
                val next = event.next
                event.marker?.active = false
                remove(event)
                event = next
            }
            // Ordinary remapCurrentToken changes survive official PsiBuilder rollback.
        }
        fun setCustomEdgeTokenBinders(left: TriviaBinder?, right: TriviaBinder?) {
            valid(); if (left != null) this.left = left; if (right != null) this.right = right
        }
    }

    /** Bind trivia in production order, then materialize a lossless immutable tree. */
    fun buildTree(): SyntaxNode {
        readable()
        check(eof()) { "Unconsumed tokens" }
        val events = buildList {
            var event = firstEvent
            while (event != null) { add(event); event = event.next }
        }
        val first = events.firstOrNull() ?: kotlin.error("Missing root marker")
        val root = first.marker ?: kotlin.error("Missing root marker")
        check(events.last() === root.close) { "Root marker must enclose all productions" }
        check(events.all { it.marker == null || it.marker.close != null }) { "Unclosed marker" }
        first.index = 0
        root.close!!.index = tokens.size
        var lastIndex = 0
        for (i in 1 until events.lastIndex) {
            val event = events[i]
            val binder = event.marker?.let { if (event.close) it.right else it.left } ?: TriviaBinder.LEFT_EDGE
            var start = maxOf(event.index, lastIndex)
            val previous = events[i - 1].index
            while (start > previous && isTrivia(tokens[start - 1].kind)) start--
            val end = skip(event.index)
            if (start != end) {
                check(start <= end) { "Invalid production order" }
                event.index = start + binder.edge(tokens.subList(start, end), source)
            } else if (event.index < start) event.index = start
            lastIndex = event.index
        }
        data class Frame(val marker: Marker, val children: MutableList<SyntaxNode> = mutableListOf(), var index: Int)
        val stack = ArrayDeque<Frame>()
        var result: SyntaxNode? = null
        var lastErrorIndex = -1
        fun leaves(frame: Frame, end: Int) {
            check(frame.index <= end) { "Overlapping productions" }
            while (frame.index < end) {
                val t = tokens[frame.index++]
                // Official light trees omit zero-length lexer leaves (e.g. DANGLING_NEWLINE).
                if (t.start != t.end) frame.children += SyntaxNode(t.kind, t.start, t.end)
            }
        }
        for (event in events) {
            val marker = event.marker
            if (marker == null) {
                // Official tree preparation retains only the first (deepest) point
                // error at a lexeme index, even across intervening marker closes.
                if (event.index == lastErrorIndex) continue
                lastErrorIndex = event.index
                val frame = stack.last(); leaves(frame, event.index)
                frame.children += SyntaxNode("ERROR_ELEMENT", offset(event.index), offset(event.index), error = event.message)
            } else if (!event.close) {
                stack.lastOrNull()?.let { leaves(it, event.index) }
                stack.addLast(Frame(marker, index = event.index))
            } else {
                val frame = stack.removeLast()
                check(frame.marker === marker) { "Unbalanced marker nesting" }
                leaves(frame, event.index)
                val node = SyntaxNode(checkNotNull(marker.kind), offset(marker.open.index), offset(event.index),
                    if (marker.collapsed) emptyList() else frame.children.toList(), marker.message)
                if (stack.isEmpty()) result = node else {
                    stack.last().children += node
                    stack.last().index = event.index
                }
            }
        }
        built = true
        return checkNotNull(result)
    }
}
