package li.songe.kotlin.parsing

import li.songe.kotlin.builder.SemanticBuilder
import li.songe.kotlin.builder.SyntaxBuilder
import li.songe.kotlin.builder.TriviaBinder
import li.songe.kotlin.tree.SyntaxNode

/** Portable non-lazy Kotlin 2.4.21 syntax parser (Apache-2.0). */
fun parseFile(source: String): SyntaxNode = DeclarationParser(source).parse()
fun parseScript(source: String): SyntaxNode = DeclarationParser(source).parse(script = true)

private class DeclarationParser(source: String) {
    private val b = SyntaxBuilder(source)
    private val s = SemanticBuilder(b)
    private val top = setOf("TYPE_ALIAS_KEYWORD", "INTERFACE_KEYWORD", "CLASS_KEYWORD", "OBJECT_KEYWORD", "FUN_KEYWORD", "VAL_KEYWORD", "VAR_KEYWORD", "PACKAGE_KEYWORD")
    private val softWords = ("import by get set field file property receiver param setparam delegate all dynamic constructor init where catch finally " +
        "actual abstract annotation companion const crossinline data enum expect external final infix inline inner internal lateinit " +
        "noinline open operator out override private protected public reified sealed suspend tailrec vararg value context contract").split(' ')
    private val soft = softWords.associate { it.uppercase() + "_KEYWORD" to it }
    private val modifiers = ("actual abstract annotation companion const crossinline data enum expect external final infix inline inner internal lateinit " +
        "noinline open operator out override private protected public reified sealed suspend tailrec vararg value").split(' ').map { it.uppercase() + "_KEYWORD" }.toSet() + "IN_KEYWORD"
    private var typeEnd = Int.MAX_VALUE
    private fun eof() = b.eof() || b.currentOffset >= typeEnd
    private fun tt() = if (eof()) null else s.tokenType
    private fun lookahead(steps: Int) = if (b.lookAheadOffset(steps) >= typeEnd) null else s.lookAhead(steps)
    private fun mark() = b.mark()
    private fun advance() { if (!eof()) s.advanceLexer() }
    private fun at(kind: String): Boolean {
        val token = tt()
        if (token == kind) return true
        if (kind == "EOL" && (eof() || token == "SEMICOLON" || s.newlineBeforeCurrentToken())) return true
        if (token == "IDENTIFIER" && soft[kind] == s.tokenText) { b.remapCurrentToken(kind); return true }
        if (kind == "IDENTIFIER" && token in soft) { b.remapCurrentToken(kind); return true }
        return false
    }
    private fun any(kinds: Set<String>) = kinds.any(::at)
    private fun consume(kind: String): Boolean = at(kind).also { if (it) advance() }
    private fun error(message: String) { tt(); b.error(message) }
    private fun errorAdvance(message: String) { val m = mark(); advance(); m.error(message) }
    private fun recovery(message: String, kinds: Set<String>?) {
        val token = tt()
        if (kinds == null || token in kinds || token == "LBRACE" || token == "RBRACE" || "EOL" in kinds && at("EOL")) error(message)
        else errorAdvance(message)
    }
    private fun expect(kind: String, message: String, kinds: Set<String>? = null): Boolean {
        if (consume(kind)) return true
        if (kind == "IDENTIFIER" && s.tokenText == "`") advance()
        recovery(message, kinds)
        return false
    }
    private fun close(m: SyntaxBuilder.Marker, kind: String, plainComments: Boolean = true) {
        m.done(kind)
        m.setCustomEdgeTokenBinders(if (plainComments) TriviaBinder.PRECEDING_COMMENTS else TriviaBinder.PRECEDING_DOC, TriviaBinder.TRAILING_COMMENTS)
    }
    fun parse(script: Boolean = false): SyntaxNode {
        val root = mark()
        preamble()
        if (script) {
            val scriptNode = mark(); val body = mark(); statements(true)
            while (!eof()) errorAdvance("Unexpected symbol")
            body.done("BLOCK"); body.setCustomEdgeTokenBinders(TriviaBinder.LEFT_EDGE, TriviaBinder.RIGHT_EDGE)
            scriptNode.done("SCRIPT"); scriptNode.setCustomEdgeTokenBinders(TriviaBinder.LEFT_EDGE, TriviaBinder.RIGHT_EDGE)
        } else while (!eof()) declaration(false)
        if (!script && b.rawLookup(-1) in setOf("BLOCK_COMMENT", "DOC_COMMENT")) {
            val text = b.source.substring(b.rawTokenTypeStart(-1), b.rawTokenTypeStart(0))
            if (text.length <= 2 || !text.endsWith("*/")) mark().apply {
                error("Unclosed comment"); setCustomEdgeTokenBinders(TriviaBinder.RIGHT_EDGE, null)
            }
        }
        root.done("KT_FILE")
        return b.buildTree()
    }
    private fun preamble() {
        val first = mark()
        fileAnnotations(AnnotationMode.FILE_BEFORE_PACKAGE)
        var pkg = mark()
        modifierList()
        if (consume("PACKAGE_KEYWORD")) {
            packageName(); first.drop(); consume("SEMICOLON"); pkg.done("PACKAGE_DIRECTIVE")
        } else {
            first.rollbackTo()
            fileAnnotations(AnnotationMode.FILE_WITHOUT_PACKAGE)
            pkg = mark(); pkg.done("PACKAGE_DIRECTIVE")
            pkg.setCustomEdgeTokenBinders(TriviaBinder.FIRST_SHEBANG, null)
        }
        imports()
    }
    private fun packageName() {
        var qualified = mark()
        var simple = true
        val recover = setOf("DOT", "EOL")
        while (true) {
            if (s.newlineBeforeCurrentToken()) {
                recovery("Package name must be a '.'-separated identifier list placed on a single line", recover); break
            }
            if (consume("DOT")) {
                qualified.error("Package name must be a '.'-separated identifier list"); qualified = mark(); continue
            }
            val ref = mark()
            val found = expect("IDENTIFIER", "Package name must be a '.'-separated identifier list", recover)
            if (found) ref.done("REFERENCE_EXPRESSION") else ref.drop()
            if (!simple) { val outer = qualified.precede(); qualified.done("DOT_QUALIFIED_EXPRESSION"); qualified = outer }
            if (!consume("DOT")) break
            if (simple && !found) { qualified.drop(); qualified = mark() } else simple = false
        }
        qualified.drop()
    }
    private fun imports() {
        val list = mark()
        if (!at("IMPORT_KEYWORD")) list.setCustomEdgeTokenBinders(TriviaBinder.LEFT_EDGE, null)
        while (at("IMPORT_KEYWORD")) importDirective()
        list.done("IMPORT_LIST")
    }
    private fun importDirective() {
        val directive = mark(); advance()
        fun closeOnNewline(message: String, alias: SyntaxBuilder.Marker? = null): Boolean {
            if (!s.newlineBeforeCurrentToken()) return false
            alias?.done("IMPORT_ALIAS"); error(message); directive.done("IMPORT_DIRECTIVE"); return true
        }
        if (closeOnNewline("Expecting qualified name")) return
        if (!at("IDENTIFIER")) {
            val bad = mark()
            while (!eof() && !at("EOL")) advance()
            bad.error("Expecting qualified name"); directive.done("IMPORT_DIRECTIVE"); consume("SEMICOLON"); return
        }
        var qualified = mark()
        mark().also { advance(); it.done("REFERENCE_EXPRESSION") }
        while (at("DOT") && lookahead(1) != "MUL") {
            advance()
            if (closeOnNewline("Import must be placed on a single line")) { qualified.drop(); return }
            val ref = mark()
            if (expect("IDENTIFIER", "Qualified name must be a '.'-separated identifier list", setOf("AS_KEYWORD", "DOT", "EOL"))) ref.done("REFERENCE_EXPRESSION") else ref.drop()
            val outer = qualified.precede(); qualified.done("DOT_QUALIFIED_EXPRESSION"); qualified = outer
        }
        qualified.drop()
        if (consume("DOT")) {
            advance() // star, established by the loop above
            if (at("AS_KEYWORD")) {
                val alias = mark(); advance()
                if (closeOnNewline("Expecting identifier")) { alias.drop(); return }
                consume("IDENTIFIER"); alias.done("IMPORT_ALIAS")
                alias.precede().error("Cannot rename all imported items to one identifier")
            }
        }
        if (at("AS_KEYWORD")) {
            val alias = mark(); advance()
            if (closeOnNewline("Expecting identifier", alias)) return
            expect("IDENTIFIER", "Expecting identifier", setOf("SEMICOLON")); alias.done("IMPORT_ALIAS")
        }
        consume("SEMICOLON"); directive.done("IMPORT_DIRECTIVE")
        directive.setCustomEdgeTokenBinders(null, TriviaBinder.TRAILING_COMMENTS)
    }
    private enum class AnnotationMode { DEFAULT, FILE_BEFORE_PACKAGE, FILE_WITHOUT_PACKAGE, TYPE, SIGNIFICANT_SPACE, NONE }
    private val annotationTargets = setOf("ALL_KEYWORD", "FILE_KEYWORD", "FIELD_KEYWORD", "GET_KEYWORD", "SET_KEYWORD", "PROPERTY_KEYWORD", "RECEIVER_KEYWORD", "PARAM_KEYWORD", "SETPARAM_KEYWORD", "DELEGATE_KEYWORD")
    private fun fileAnnotations(mode: AnnotationMode) {
        val list = mark()
        if (annotations(mode)) list.done("FILE_ANNOTATION_LIST") else list.drop()
    }
    private fun annotations(mode: AnnotationMode = AnnotationMode.DEFAULT): Boolean {
        var found = false
        while (annotationOrList(mode)) found = true
        return found
    }
    private fun annotationOrList(mode: AnnotationMode): Boolean {
        if (mode == AnnotationMode.NONE || !at("AT")) return false
        val raw = b.rawLookup(1)
        val targeted = ((raw == "IDENTIFIER" || raw in annotationTargets) && lookahead(2) == "COLON") || lookahead(1) == "COLON"
        val next = if (targeted) lookahead(if (lookahead(1) == "COLON") 2 else 3) else raw
        if (next == "IDENTIFIER") return annotation(mode)
        if (next == "LBRACKET") {
            val list = mark(); s.disableNewlines(); advance()
            if (!annotationTarget(mode)) { list.rollbackTo(); s.restoreNewlinesState(); return false }
            advance()
            if (!at("IDENTIFIER") && !at("AT")) error("Expecting a list of annotations")
            else while (at("IDENTIFIER") || at("AT")) {
                if (at("AT")) { errorAdvance("No '@' needed in annotation list"); continue }
                annotation(AnnotationMode.DEFAULT)
                while (at("COMMA")) errorAdvance("No commas needed to separate annotations")
            }
            expect("RBRACKET", "Expecting ']' to close the annotation list")
            s.restoreNewlinesState(); list.done("ANNOTATION"); return true
        }
        val bad = mark()
        repeat(if (!targeted) 1 else if (lookahead(1) == "COLON") 2 else 3) { advance() }
        bad.error(if (targeted) "Expected annotation identifier after ':'" else "Expected annotation identifier after '@'")
        return true
    }
    private fun annotationTarget(mode: AnnotationMode): Boolean {
        val message = "Expected annotation target before ':'"
        if (at("COLON")) { errorAdvance(message); return true }
        val target = annotationTargets.firstOrNull(::at)
        if (mode == AnnotationMode.FILE_WITHOUT_PACKAGE && !(target == "FILE_KEYWORD" && lookahead(1) == "COLON")) return false
        if (lookahead(1) == "COLON" && target == null && at("IDENTIFIER")) { errorAdvance(message); advance(); return true }
        val keyword = target ?: if (mode == AnnotationMode.FILE_BEFORE_PACKAGE || mode == AnnotationMode.FILE_WITHOUT_PACKAGE) "FILE_KEYWORD" else null
        if (keyword != null) {
            val marker = mark()
            val expected = "Expecting \"${soft.getValue(keyword)}:\" prefix for ${soft.getValue(keyword)} annotations"
            if (consume(keyword)) marker.done("ANNOTATION_TARGET") else { error(expected); marker.drop() }
            if (!consume("COLON")) recovery(expected, setOf("IDENTIFIER", "RBRACKET", "LBRACKET"))
        }
        return true
    }
    private fun annotation(mode: AnnotationMode): Boolean {
        val m = mark()
        if (consume("AT") && !annotationTarget(mode)) { m.rollbackTo(); return false }
        val callee = mark(); val ref = mark(); userType(); ref.done("TYPE_REFERENCE"); callee.done("CONSTRUCTOR_CALLEE")
        typeArguments()
        if (at("LPAR") && lookahead(1) !in setOf("VAL_KEYWORD", "VAR_KEYWORD") &&
            !(mode == AnnotationMode.SIGNIFICANT_SPACE && b.rawLookup(-1) in setOf("WHITE_SPACE", "EOL_COMMENT", "BLOCK_COMMENT", "DOC_COMMENT"))) {
            arguments()
            var i = -1
            while (b.rawLookup(i) in setOf("WHITE_SPACE", "EOL_COMMENT", "BLOCK_COMMENT", "DOC_COMMENT")) i--
            if (mode in setOf(AnnotationMode.TYPE, AnnotationMode.SIGNIFICANT_SPACE) && (b.rawLookup(i) != "RPAR" || at("ARROW"))) {
                m.done("ANNOTATION_ENTRY"); return false
            }
        }
        m.done("ANNOTATION_ENTRY"); return true
    }
    private fun modifierList(allowed: Set<String> = modifiers, stopBefore: Set<String> = emptySet(), annotationMode: AnnotationMode = AnnotationMode.DEFAULT): Set<String> {
        val m = mark(); val found = mutableSetOf<String>()
        var hasAnnotation = false
        while (!eof()) {
            if (at("AT") && annotationMode != AnnotationMode.NONE) {
                val before = mark()
                if (!annotationOrList(annotationMode)) {
                    before.rollbackTo()
                    annotationOrList(AnnotationMode.SIGNIFICANT_SPACE)
                } else before.drop()
                hasAnnotation = true; continue
            }
            if (at("CONTEXT_KEYWORD") && lookahead(1) == "LPAR" && annotationMode == AnnotationMode.DEFAULT) {
                contextParameters(false); hasAnnotation = true; continue
            }
            val token = tt()
            val kind = if (token in allowed) token else soft.entries.firstOrNull { it.key in allowed && it.value == s.tokenText }?.key
            if (token == "FUN_KEYWORD" && lookahead(1) == "INTERFACE_KEYWORD" && allowed === modifiers) {
                found += token; advance(); continue
            }
            if (kind == null) break
            // Upstream remapping survives the speculative modifier rollback.
            b.remapCurrentToken(kind)
            if (lookahead(1) == null || lookahead(1) in stopBefore) break
            b.remapCurrentToken(kind); found += kind; advance()
        }
        if (found.isEmpty() && !hasAnnotation) m.drop() else m.done("MODIFIER_LIST")
        if (hasAnnotation) found += "ANNOTATION_ENTRY"
        return found
    }
    private fun declaration(member: Boolean) {
        if (consume("SEMICOLON")) return
        val m = mark()
        val companionBlock = member && at("COMPANION_KEYWORD") && lookahead(1) == "LBRACE"
        val mods = modifierList()
        val kind = if (companionBlock) { classBody(); "COMPANION_BLOCK" } else when (tt()) {
            "CLASS_KEYWORD", "INTERFACE_KEYWORD", "OBJECT_KEYWORD" -> classifier(mods)
            "TYPE_ALIAS_KEYWORD" -> typeAlias()
            "FUN_KEYWORD" -> function()
            "VAL_KEYWORD", "VAR_KEYWORD" -> property()
            "LPAR", "LBRACKET" -> if (lookahead(1) in setOf("VAL_KEYWORD", "VAR_KEYWORD")) property() else null
            else -> when {
                "ENUM_KEYWORD" in mods && at("IDENTIFIER") -> classifier(mods, expectKeyword = false)
                member && at("INIT_KEYWORD") -> { advance(); if (at("LBRACE")) block() else mark().error("Expecting '{' after 'init'"); "CLASS_INITIALIZER" }
                member && at("CONSTRUCTOR_KEYWORD") -> { secondaryConstructor(); "SECONDARY_CONSTRUCTOR" }
                at("LBRACE") -> { error(if (member) "Expecting member declaration" else "Expecting a top level declaration"); block(); "FUN" }
                else -> null
            }
        }
        if (kind != null) close(m, kind)
        else if (!member && at("IMPORT_KEYWORD")) { error("imports are only allowed in the beginning of file"); imports(); m.drop() }
        else { errorAdvance(if (member) "Expecting member declaration" else "Expecting a top level declaration"); m.drop() }
    }
    private fun classifier(mods: Set<String>, objectExpression: Boolean = false, expectKeyword: Boolean = true): String {
        val obj = at("OBJECT_KEYWORD")
        if (expectKeyword) advance() else error("'class' keyword is expected after 'enum'")
        if (objectExpression) { if (at("IDENTIFIER")) errorAdvance("An object expression cannot bind a name") }
        else if (obj && "COMPANION_KEYWORD" in mods) consume("IDENTIFIER")
        else expect("IDENTIFIER", "Name expected", top + setOf("LT", "LPAR", "COLON", "LBRACE"))
        val generic = at("LT"); typeParameters()
        val before = mark(); val constructor = mark(); val constructorMods = modifierList()
        if (constructorMods.isNotEmpty() && !any(setOf("LPAR", "LBRACE", "COLON", "CONSTRUCTOR_KEYWORD"))) {
            before.rollbackTo(); return if (obj) "OBJECT_DECLARATION" else "CLASS"
        }
        before.drop()
        val keyword = consume("CONSTRUCTOR_KEYWORD")
        if (at("LPAR")) { parameters(true, setOf("LBRACE", "RBRACE")); constructor.done("PRIMARY_CONSTRUCTOR") }
        else if (constructorMods.isNotEmpty() || keyword) {
            constructor.done("PRIMARY_CONSTRUCTOR"); error(if (keyword) "Expecting primary constructor parameter list" else "Expecting 'constructor' keyword")
        } else constructor.drop()
        if (consume("COLON")) supertypes()
        constraints(generic, if (obj) "Where clause is not allowed for objects" else null)
        if (at("LBRACE")) classBody("ENUM_KEYWORD" in mods)
        else if (objectExpression) { val body = mark(); error("Expecting a class body"); body.done("CLASS_BODY") }
        return if (obj) "OBJECT_DECLARATION" else "CLASS"
    }
    private fun classBody(enum: Boolean = false) {
        val body = mark(); s.enableNewlines(); advance()
        if (enum) {
            var membersAllowed = false
            while (!eof() && !at("RBRACE")) {
                val entry = mark(); modifierList(stopBefore = setOf("COMMA", "SEMICOLON", "RBRACE"))
                if (at("INIT_KEYWORD") || at("CONSTRUCTOR_KEYWORD") || !at("IDENTIFIER")) {
                    entry.rollbackTo(); membersAllowed = consume("SEMICOLON"); break
                }
                advance()
                if (at("LPAR")) {
                    val initializers = mark(); val call = mark(); val callee = mark(); val ref = mark(); val user = mark()
                    mark().done("ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION")
                    user.done("USER_TYPE"); ref.done("TYPE_REFERENCE"); callee.done("CONSTRUCTOR_CALLEE")
                    arguments(); call.done("SUPER_TYPE_CALL_ENTRY"); initializers.done("INITIALIZER_LIST")
                }
                if (at("LBRACE")) classBody()
                val comma = consume("COMMA"); val semi = consume("SEMICOLON")
                close(entry, "ENUM_ENTRY")
                if (semi) { membersAllowed = true; break }
                if (!comma) break
            }
            if (!membersAllowed && !at("RBRACE")) error("Expecting ';' after the last enum entry or '}' to close enum class body")
        }
        while (!eof() && !at("RBRACE")) declaration(true)
        expect("RBRACE", if (enum) "Expecting '}' to close enum class body" else "Missing '}")
        s.restoreNewlinesState(); body.done("CLASS_BODY")
    }
    private fun supertypes() {
        val list = mark()
        while (true) {
            if (at("COMMA")) { errorAdvance("Expecting a delegation specifier"); continue }
            val entry = mark(); val callee = mark(); typeRef()
            when {
                consume("BY_KEYWORD") -> { callee.drop(); val old = delegationStart; delegationStart = b.rawTokenIndex(); try { expression() } finally { delegationStart = old }; entry.done("DELEGATED_SUPER_TYPE_ENTRY") }
                at("LPAR") -> { callee.done("CONSTRUCTOR_CALLEE"); arguments(); entry.done("SUPER_TYPE_CALL_ENTRY") }
                else -> { callee.drop(); entry.done("SUPER_TYPE_ENTRY") }
            }
            if (!consume("COMMA")) break
        }
        list.done("SUPER_TYPE_LIST")
    }
    private fun constraints(generic: Boolean, prohibited: String? = null) {
        val guard = mark()
        if (!consume("WHERE_KEYWORD")) { guard.drop(); return }
        val list = mark()
        while (true) {
            if (at("COMMA")) errorAdvance("Type constraint expected")
            val constraint = mark(); annotations(); val name = mark()
            if (expect("IDENTIFIER", "Expecting type parameter name", setOf("COLON", "COMMA", "LBRACE", "RBRACE", "IDENTIFIER", "LPAR"))) name.done("REFERENCE_EXPRESSION") else name.drop()
            expect("COLON", "Expecting ':' before the upper bound", setOf("LBRACE", "RBRACE", "IDENTIFIER", "LPAR"))
            typeRef(); constraint.done("TYPE_CONSTRAINT")
            if (!consume("COMMA")) break
        }
        list.done("TYPE_CONSTRAINT_LIST")
        when {
            prohibited != null -> guard.error(prohibited)
            !generic -> guard.error("Type constraints are not allowed when no type parameters declared")
            else -> guard.drop()
        }
    }
    private fun secondaryConstructor() {
        advance()
        if (at("LPAR")) parameters(true, setOf("LBRACE", "SEMICOLON", "RPAR", "EOL", "RBRACE"))
        else recovery("Expecting '('", setOf("LBRACE", "SEMICOLON", "RPAR", "EOL", "RBRACE", "COLON"))
        val explicit = consume("COLON"); val delegation = mark()
        val callee = mark()
        if (explicit) {
            if (at("THIS_KEYWORD") || at("SUPER_KEYWORD")) { advance(); callee.done("CONSTRUCTOR_DELEGATION_REFERENCE"); arguments() }
            else {
                callee.drop(); error("Expecting a 'this' or 'super' constructor call")
                val before = if (!at("LPAR")) mark().also { advance() } else null
                arguments()
                if (before != null) { if (at("LBRACE")) before.drop() else before.rollbackTo() }
            }
        } else callee.done("CONSTRUCTOR_DELEGATION_REFERENCE")
        delegation.done("CONSTRUCTOR_DELEGATION_CALL")
        if (at("LBRACE")) block()
    }
    private fun typeAlias(): String {
        advance(); expect("IDENTIFIER", "Type name expected", top + setOf("LT", "EQ", "SEMICOLON"))
        typeParameters()
        constraints(true, "Type alias parameters can't have bounds")
        expect("EQ", "Expecting '='", top + "SEMICOLON"); typeRef(); consume("SEMICOLON")
        return "TYPEALIAS"
    }
    private fun function(): String {
        advance()
        if (at("RBRACE")) { error("Function body expected"); return "FUN" }
        var generic = at("LT"); typeParameters()
        val follow = setOf("LT", "LPAR", "RPAR", "COLON", "EQ")
        s.disableJoiningComplexTokens()
        val receiver = receiverType("function", follow)
        if (!any(follow)) expect("IDENTIFIER", "Expecting function name" + if (receiver) "" else " or receiver type", follow + top + setOf("LBRACE", "RBRACE"))
        s.restoreJoiningComplexTokensState()
        if (at("LT")) {
            var duplicate = mark(); typeParameters()
            if (generic) {
                val finish = b.rawTokenIndex(); duplicate.rollbackTo(); duplicate = mark()
                repeat(finish - b.rawTokenIndex()) { advance() }
                duplicate.error("Only one type parameter list is allowed for a function")
            } else duplicate.drop()
            generic = true
        }
        if (at("LPAR")) parameters(false, setOf("EQ", "LBRACE", "RBRACE", "SEMICOLON", "RPAR")) else error("Expecting '('")
        if (consume("COLON")) typeRef()
        val hadContract = contract()
        constraints(generic)
        if (!hadContract) contract()
        if (!consume("SEMICOLON")) {
            if (consume("EQ")) { expression(); consume("SEMICOLON") }
            else if (at("LBRACE")) block()
        }
        return "FUN"
    }
    private fun property(local: Boolean = false, script: Boolean = false): String {
        val short = at("VAL_KEYWORD") || at("VAR_KEYWORD")
        if (short) advance()
        val generic = at("LT"); typeParameters()
        val follow = setOf("COLON", "EQ", "LBRACE", "RBRACE", "SEMICOLON") + top
        s.disableJoiningComplexTokens()
        val receiver = receiverType("property", follow)
        val multi = at("LPAR") || at("LBRACKET")
        val nextLine = at("EOL"); val before = mark()
        if (multi) {
            val invalid = mark(); destructuring(if (short) follow else follow - setOf("VAL_KEYWORD", "VAR_KEYWORD"), if (short) 0 else 1)
            if (!local) invalid.error("Destructuring declarations are only allowed for local variables/values") else invalid.drop()
        } else expect("IDENTIFIER", "Expecting property name" + if (receiver) "" else " or receiver type", follow)
        s.restoreJoiningComplexTokensState()
        val type = mark(); val typed = consume("COLON"); if (typed) typeRef()
        if (typed && multi) type.error("Type annotations are not allowed on destructuring declarations") else type.drop()
        constraints(generic)
        var assigned = consume("EQ")
        if (assigned) expression()
        else if (at("BY_KEYWORD")) { val delegate = mark(); advance(); expression(); delegate.done("PROPERTY_DELEGATE"); assigned = true }
        val node = if (multi) "DESTRUCTURING_DECLARATION" else "PROPERTY"
        if (!assigned && nextLine && !typed && !receiver && (!multi || short)) { before.rollbackTo(); error("Expecting property name or receiver type"); return node }
        before.drop()
        if (local && !script) return node
        s.enableNewlines()
        val semiNewline = consume("SEMICOLON") && s.newlineBeforeCurrentToken()
        s.restoreNewlinesState()
        if (!semiNewline) {
            val components = mutableSetOf<String>()
            while (true) { val component = accessor(components) ?: break; components += component }
            if (!any(setOf("EOL", "RBRACE"))) {
                var i = -1
                while (b.rawLookup(i) in setOf("WHITE_SPACE", "BLOCK_COMMENT", "DOC_COMMENT", "EOL_COMMENT")) i--
                if (b.rawLookup(i) != "SEMICOLON") {
                    val bad = mark()
                    while (!eof() && !any(top + setOf("EOL", "LBRACE", "RBRACE"))) advance()
                    bad.error("Property getter or setter expected")
                }
            } else consume("SEMICOLON")
        }
        return node
    }
    private fun destructuring(follow: Set<String>, mode: Int = 0) {
        s.disableNewlines(); val parens = at("LPAR"); val closing = if (parens) "RPAR" else "RBRACKET"; advance()
        if (!any(follow)) while (true) {
            if (at("COMMA")) errorAdvance("Expecting a name")
            else if (at(closing)) { error("Expecting a name"); break }
            val p = mark(); val recovery = follow + setOf("COLON", "EQ", "COMMA", "RPAR", "VAL_KEYWORD", "VAR_KEYWORD")
            if (mode == 0) modifierList(stopBefore = setOf("COMMA", "RPAR", "RBRACKET", "COLON", "EQ"))
            else if (at("VAL_KEYWORD") || mode == 1 && at("VAR_KEYWORD")) advance()
            else recovery(if (mode == 1) "Expecting val or var keyword" else "Expecting val keyword", recovery)
            expect("IDENTIFIER", "Expecting a name", recovery)
            if (consume("COLON")) typeRef()
            if (parens && consume("EQ")) { val ref = mark(); expect("IDENTIFIER", "Expecting an identifier"); ref.done("REFERENCE_EXPRESSION") }
            p.done("DESTRUCTURING_DECLARATION_ENTRY")
            if (!consume("COMMA") || at(closing)) break
        }
        expect(closing, if (parens) "Expecting ')'" else "Expecting ']'", follow); s.restoreNewlinesState()
    }
    private fun receiverType(title: String, follow: Set<String>): Boolean {
        val annotationStart = mark()
        val annotated = annotations()
        val scan = mark()
        val parenthesized = at("LPAR")
        var angle = 0; var paren = 0; var bracket = 0; var brace = 0; var dot = -1
        while (!eof()) {
            val topLevel = angle == 0 && paren == 0 && bracket == 0 && brace == 0
            val token = tt()
            if (topLevel) {
                if (token == "DOT" || token == "SAFE_ACCESS") {
                    dot = b.currentOffset
                    if (parenthesized) break
                }
                if (token in top + setOf("EQ", "COLON", "LBRACE", "RBRACE", "BY_KEYWORD")) break
                if (parenthesized) {
                    if (token !in setOf("QUEST", "LPAR", "RPAR")) break
                } else if (token == "LPAR" || at("IDENTIFIER") && lookahead(1) !in setOf("LT", "DOT", "SAFE_ACCESS", "QUEST")) break
            }
            when (token) {
                "LT" -> angle++
                "GT" -> angle--
                "LPAR" -> paren++
                "RPAR" -> paren--
                "LBRACKET" -> bracket++
                "RBRACKET" -> bracket--
                "LBRACE" -> brace++
                "RBRACE" -> brace--
            }
            advance()
        }
        scan.rollbackTo()
        if (annotated && dot >= 0) annotationStart.rollbackTo()
        else if (annotated) annotationStart.error("Annotations are not allowed in this position") else annotationStart.drop()
        if (dot < 0) return false
        val previousEnd = typeEnd
        typeEnd = dot
        try { typeRef() } finally { typeEnd = previousEnd }
        if (at("DOT") || at("SAFE_ACCESS")) advance()
        else recovery("Expecting '.' before a $title name", follow)
        return true
    }
    private fun accessor(seen: Set<String>): String? {
        val component = mark(); modifierList()
        val kind = when {
            at("GET_KEYWORD") -> "GET_KEYWORD"
            at("SET_KEYWORD") -> "SET_KEYWORD"
            at("FIELD_KEYWORD") -> "FIELD_KEYWORD"
            else -> null
        }
        if (kind == null || kind in seen) { component.rollbackTo(); return null }
        advance()
        val field = kind == "FIELD_KEYWORD"
        val firstOrEnd = modifiers + setOf("AT", "GET_KEYWORD", "SET_KEYWORD", "FIELD_KEYWORD", "EOL", "RBRACE")
        if (!at("LPAR") && !field) {
            if (!any(firstOrEnd)) {
                val bad = mark()
                while (!eof() && !any(firstOrEnd + setOf("LBRACE", "LPAR", "EQ"))) advance()
                bad.error("Accessor body expected")
            } else { close(component, "PROPERTY_ACCESSOR"); return kind }
        }
        s.disableNewlines()
        if (!field) {
            val parameters = mark()
            expect("LPAR", "Expecting '('", setOf("RPAR", "IDENTIFIER", "COLON", "LBRACE", "EQ"))
            if (kind == "SET_KEYWORD") {
                val parameter = mark(); modifierList(stopBefore = setOf("COMMA", "COLON", "RPAR"))
                expect("IDENTIFIER", "Expecting parameter name", setOf("RPAR", "COLON", "LBRACE", "EQ"))
                if (consume("COLON")) typeRef()
                parameter.done("VALUE_PARAMETER"); consume("COMMA")
            }
            if (!at("RPAR")) {
                val bad = mark()
                while (!eof() && !any(setOf("RPAR", "COLON", "LBRACE", "RBRACE", "EQ", "EOL"))) advance()
                bad.error("Expecting ')'")
            }
            consume("RPAR"); parameters.done("VALUE_PARAMETER_LIST")
        }
        s.restoreNewlinesState()
        if (consume("COLON")) typeRef()
        if (consume("EQ")) { expression(); consume("SEMICOLON") }
        else if (!field) {
            contract()
            if (at("LBRACE")) block() else error("Expecting function body")
        }
        close(component, if (field) "BACKING_FIELD" else "PROPERTY_ACCESSOR")
        return kind
    }
    private fun typeParameters() {
        if (!at("LT")) return
        val list = mark(); s.disableNewlines(); advance()
        while (true) {
            if (at("COMMA")) errorAdvance("Expecting type parameter declaration")
            if (any(setOf("WHERE_KEYWORD", "LPAR", "COLON", "LBRACE", "GT"))) error("Type parameter declaration expected")
            else {
                val p = mark(); modifierList(stopBefore = setOf("GT", "COMMA", "COLON"))
                expect("IDENTIFIER", "Type parameter name expected", emptySet())
                if (consume("COLON")) typeRef()
                p.done("TYPE_PARAMETER")
            }
            if (!consume("COMMA") || at("GT")) break
        }
        expect("GT", "Missing '>'", setOf("WHERE_KEYWORD", "LPAR", "COLON", "LBRACE", "GT"))
        s.restoreNewlinesState(); list.done("TYPE_PARAMETER_LIST")
    }
    private fun typeRef(intersections: Boolean = true, extraRecovery: Set<String> = emptySet()) { typeContents(intersections, extraRecovery).done("TYPE_REFERENCE") }
    private fun typeContents(intersections: Boolean = true, extraRecovery: Set<String> = emptySet()): SyntaxBuilder.Marker {
        val ref = mark(); modifierList(setOf("SUSPEND_KEYWORD"), annotationMode = AnnotationMode.TYPE)
        val context = mark()
        val withContext = at("CONTEXT_KEYWORD") && lookahead(1) == "LPAR"
        if (withContext) contextParameters(true)
        var element = mark()
        var functionParsed = false
        var typeBeforeDot = true
        if (at("IDENTIFIER") || at("PACKAGE_KEYWORD") || platformWord(0, "Mutable")) {
            if (s.tokenText == "dynamic" && lookahead(1) !in setOf("DOT", "LT")) {
                val d = mark(); at("DYNAMIC_KEYWORD"); advance(); d.done("DYNAMIC_TYPE")
            } else userType()
        } else if (at("LPAR")) {
            val attempt = mark(); advance(); typeContents().drop()
            if (at("RPAR") && lookahead(1) != "ARROW") { advance(); attempt.drop() }
            else {
                attempt.rollbackTo(); functionType(context.precede()); functionParsed = true
            }
        } else {
            recovery("Type expected", extraRecovery + top + setOf("EQ", "COMMA", "GT", "RBRACKET", "DOT", "RPAR", "RBRACE", "LBRACE", "SEMICOLON"))
            typeBeforeDot = false
        }
        s.disableJoiningComplexTokens()
        while (at("QUEST") && b.rawLookup(1) != "COLON") { val outer = element.precede(); advance(); element.done("NULLABLE_TYPE"); element = outer }
        s.restoreJoiningComplexTokensState()
        var intersection = false
        if (intersections && at("AND")) {
            val left = element; element = left.precede(); val joined = left.precede()
            left.done("TYPE_REFERENCE"); advance(); typeRef(); joined.done("INTERSECTION_TYPE"); intersection = true
        }
        if (typeBeforeDot && at("DOT") && !functionParsed && !intersection) {
            val function = context.precede()
            val receiverRef = element.precede(); val receiver = receiverRef.precede()
            receiverRef.done("TYPE_REFERENCE"); receiver.done("FUNCTION_TYPE_RECEIVER")
            advance()
            if (at("LPAR")) functionType(function) else { function.drop(); error("Expecting function type") }
            functionParsed = true
        }
        if (withContext && !functionParsed) recovery("Function type expected expected", top + setOf("EQ", "COMMA", "GT", "RBRACKET", "DOT", "RPAR", "RBRACE", "LBRACE", "SEMICOLON"))
        element.drop(); context.drop(); return ref
    }
    private fun contextParameters(inType: Boolean) {
        val list = mark(); advance()
        if (lookahead(1) == "RPAR") { advance(); error("Empty context parameter list"); advance() }
        else {
            advance()
            val recover = setOf("CLASS_KEYWORD", "OBJECT_KEYWORD", "FUN_KEYWORD", "VAL_KEYWORD", "VAR_KEYWORD")
            if (!at("RPAR") && !any(recover)) while (true) {
                if (at("RPAR")) break
                val offset = b.currentOffset
                if (!parameter(true, true)) {
                    val receiver = mark()
                    if (!inType && (at("AT") || at("IDENTIFIER") && b.rawLookup(1) == "AT")) labelDefinition()
                    typeRef(); receiver.done("CONTEXT_RECEIVER")
                }
                if (consume("COMMA")) continue
                if (!at("RPAR")) error("Expecting comma or ')'")
                if (b.currentOffset == offset || !any(modifiers + setOf("IDENTIFIER", "AT", "LBRACKET", "VAL_KEYWORD", "VAR_KEYWORD"))) break
            }
            expect("RPAR", "Expecting ')'", recover)
        }
        list.done("CONTEXT_PARAMETER_LIST")
    }
    private fun platformWord(offset: Int, word: String, consume: Boolean = false): Boolean {
        if (lookahead(offset) != "LPAR" || lookahead(offset + 1) != "IDENTIFIER" || lookahead(offset + 2) != "RPAR" || lookahead(offset + 3) != "IDENTIFIER") return false
        val probe = mark(); repeat(offset + 1) { advance() }
        if (s.tokenText != word) { probe.rollbackTo(); return false }
        advance(); advance()
        if (consume) probe.error("Unexpected tokens") else probe.rollbackTo()
        return true
    }
    private fun userType() {
        var user = mark()
        if (at("PACKAGE_KEYWORD")) {
            errorAdvance("Expecting an element")
            expect("DOT", "Expecting '.'", setOf("IDENTIFIER", "LBRACE", "RBRACE"))
        }
        while (true) {
            val name = mark()
            platformWord(0, "Mutable", true)
            if (expect("IDENTIFIER", "Expecting type name", top + setOf("LT", "DOT", "COMMA", "GT", "QUEST", "LPAR", "RPAR", "EOL"))) name.done("REFERENCE_EXPRESSION") else { name.drop(); break }
            typeArguments()
            if (at("EXCL")) errorAdvance("Unexpected token")
            if (!at("DOT") || lookahead(1) == "LPAR" && !platformWord(1, "Mutable")) break
            val outer = user.precede(); user.done("USER_TYPE"); user = outer; advance()
        }
        user.done("USER_TYPE")
    }
    private fun typeArguments(extraRecovery: Set<String> = emptySet()): Boolean {
        if (!at("LT")) return false
        val args = mark(); s.disableNewlines(); advance()
        while (true) {
            val projection = mark()
            platformWord(0, "out", true)
            modifierList(setOf("IN_KEYWORD", "OUT_KEYWORD"), setOf("COMMA", "COLON", "GT"), AnnotationMode.NONE)
            if (!consume("MUL")) typeRef(extraRecovery = extraRecovery)
            projection.done("TYPE_PROJECTION")
            if (!consume("COMMA") || at("GT")) break
        }
        val complete = consume("GT")
        if (!complete) error("Expecting a '>'")
        s.restoreNewlinesState(); args.done("TYPE_ARGUMENT_LIST")
        return complete
    }
    private fun functionType(marker: SyntaxBuilder.Marker) {
        parameters(true, emptySet(), functionType = true)
        expect("ARROW", "Expecting '->' to specify return type of a function type", setOf("LBRACKET", "IDENTIFIER", "LPAR", "HASH", "DYNAMIC_KEYWORD"))
        typeRef(); marker.done("FUNCTION_TYPE")
    }
    private fun parameter(required: Boolean, rollback: Boolean): Boolean {
        val parameter = mark(); modifierList(stopBefore = setOf("COLON", "EQ", "COMMA", "RPAR"))
        if (at("VAL_KEYWORD") || at("VAR_KEYWORD")) advance()
        val recover = setOf("COLON", "EQ", "COMMA", "RPAR", "VAL_KEYWORD", "VAR_KEYWORD")
        var valid = true
        if (at("COMMA") || at("RPAR")) { error("Expecting a parameter declaration"); valid = false }
        else if (at("IDENTIFIER") && lookahead(1) == "LT") { error("Parameter name expected"); valid = false; typeRef() }
        else if (at("COLON")) { error("Parameter name expected"); advance(); typeRef() }
        else {
            expect("IDENTIFIER", "Parameter name expected", recover)
            if (consume("COLON")) {
                if (at("IDENTIFIER") && lookahead(1) == "COLON") { error("Type reference expected"); valid = false }
                else typeRef()
            } else if (required) { recovery("Parameters must have type annotation", recover); valid = false }
        }
        if (consume("EQ")) expression()
        if (!valid && rollback) { parameter.rollbackTo(); return false }
        close(parameter, "VALUE_PARAMETER", false); return true
    }
    private fun parameters(required: Boolean, recover: Set<String>, functionType: Boolean = false) {
        val list = mark(); s.disableNewlines(); advance()
        if (!at("RPAR") && !any(recover)) while (true) {
            if (at("RPAR")) break
            val offset = b.currentOffset
            if (!parameter(required, functionType)) {
                val p = mark()
                modifierList(setOf("OUT_KEYWORD", "VARARG_KEYWORD"), setOf("COLON", "EQ", "COMMA", "RPAR"), AnnotationMode.NONE)
                typeRef(); close(p, "VALUE_PARAMETER", false)
            }
            if (consume("COMMA")) continue
            if (at("COLON") && b.currentOffset != offset) continue
            if (!at("RPAR")) error("Expecting comma or ')'")
            if (b.currentOffset == offset || !any(modifiers + setOf("IDENTIFIER", "VAL_KEYWORD", "VAR_KEYWORD", "AT", "LBRACKET"))) break
        }
        expect("RPAR", "Expecting ')'", recover); s.restoreNewlinesState(); list.done("VALUE_PARAMETER_LIST")
    }
    private fun block() {
        val body = mark(); s.enableNewlines(); expect("LBRACE", "Expecting '{' to open a block")
        statements()
        expect("RBRACE", "Expecting '}'"); s.restoreNewlinesState(); body.done("BLOCK")
    }
    private fun localDeclaration(script: Boolean = false, expressionOnly: Boolean = false): Boolean {
        val m = mark(); val mods = modifierList()
        if (expressionOnly && (tt() != "FUN_KEYWORD" || lookahead(1) == "IDENTIFIER" && lookahead(2) !in setOf("DOT", "QUEST"))) { m.rollbackTo(); return false }
        val kind = when (tt()) {
            "VAL_KEYWORD", "VAR_KEYWORD" -> property(true, script)
            "LPAR", "LBRACKET" -> if (lookahead(1) in setOf("VAL_KEYWORD", "VAR_KEYWORD")) property(true, script) else null
            "FUN_KEYWORD" -> function()
            "CLASS_KEYWORD", "INTERFACE_KEYWORD" -> classifier(mods)
            "OBJECT_KEYWORD" -> if (lookahead(1) !in setOf("COLON", "LBRACE")) classifier(mods) else null
            "TYPE_ALIAS_KEYWORD" -> typeAlias()
            else -> null
        }
        if (kind == null) { m.rollbackTo(); return false }
        close(m, kind, kind !in setOf("PROPERTY", "DESTRUCTURING_DECLARATION")); return true
    }
    private fun statements(script: Boolean = false) {
        while (consume("SEMICOLON")) { /* empty statements */ }
        while (!at("RBRACE") && !eof()) {
            val offset = b.currentOffset
            if (!any(expressionFirst + top + modifiers)) errorAdvance("Expecting an element")
            if (any(expressionFirst + top + modifiers)) {
                if (!localDeclaration(script)) {
                    if (script) { val init = mark(); expression(); init.done("SCRIPT_INITIALIZER") } else expression()
                }
            }
            if (b.currentOffset == offset && !eof() && !at("RBRACE")) errorAdvance("Expecting a statement")
            if (consume("SEMICOLON")) { while (consume("SEMICOLON")) { /* delimiters */ } }
            else if (!script && !at("RBRACE") && !s.newlineBeforeCurrentToken()) {
                val message = "Unexpected tokens (use ';' to separate expressions on the same line)"
                if (tt() in (expressionFirst + top).filter { it.endsWith("_KEYWORD") && it != "IN_KEYWORD" }) error(message)
                else errorUntil(message, setOf("EOL", "LBRACE", "RBRACE"))
            }
        }
    }
    private fun errorUntil(message: String, recovery: Set<String>) {
        val m = mark(); while (!eof() && !any(recovery)) advance(); m.error(message)
    }
    private fun arguments() {
        val list = mark(); s.disableNewlines()
        if (expect("LPAR", "Expecting an argument list")) {
            if (!at("RPAR")) while (true) {
                val argument = mark()
                if (at("IDENTIFIER") && lookahead(1) == "EQ") {
                    val name = mark(); val ref = mark(); advance(); ref.done("REFERENCE_EXPRESSION"); name.done("VALUE_ARGUMENT_NAME"); advance()
                }
                consume("MUL")
                expression("Expecting an argument")
                argument.done("VALUE_ARGUMENT")
                if (at("COLON") && lookahead(1) == "IDENTIFIER") {
                    val bad = mark(); advance(); advance(); bad.error("Unexpected type specification")
                }
                if (!at("COMMA")) {
                    if (tt() in setOf("IDENTIFIER", "INTEGER_LITERAL", "FLOAT_LITERAL", "OPEN_QUOTE", "INTERPOLATION_PREFIX", "CHARACTER_LITERAL", "TRUE_KEYWORD", "FALSE_KEYWORD", "NULL_KEYWORD")) {
                        error("Expecting ','"); continue
                    }
                    break
                }
                advance()
                if (at("RPAR")) break
            }
            expect("RPAR", "Expecting ')'", setOf("EOL", "ARROW", "COMMA", "RBRACE", "RPAR", "RBRACKET"))
        }
        s.restoreNewlinesState(); list.done("VALUE_ARGUMENT_LIST")
    }
    private fun stringTemplate() {
        val template = mark()
        if (at("INTERPOLATION_PREFIX")) { val prefix = mark(); advance(); prefix.done("STRING_INTERPOLATION_PREFIX") }
        advance()
        while (!eof() && !at("CLOSING_QUOTE") && !at("DANGLING_NEWLINE")) {
            val entry = mark()
            when (tt()) {
                "REGULAR_STRING_PART" -> { advance(); entry.done("LITERAL_STRING_TEMPLATE_ENTRY") }
                "ESCAPE_SEQUENCE" -> { advance(); entry.done("ESCAPE_STRING_TEMPLATE_ENTRY") }
                "SHORT_TEMPLATE_ENTRY_START" -> {
                    advance()
                    if (at("THIS_KEYWORD")) {
                        val thisNode = mark(); val ref = mark(); advance(); ref.done("REFERENCE_EXPRESSION"); thisNode.done("THIS_EXPRESSION")
                    } else {
                        val keyword = li.songe.kotlin.lexer.tokenize(s.tokenText ?: "").singleOrNull()?.kind
                        if (keyword != null && keyword.endsWith("_KEYWORD") && keyword !in soft) {
                            b.remapCurrentToken(keyword); errorAdvance("Keyword cannot be used as a reference")
                        } else { val ref = mark(); expect("IDENTIFIER", "Expecting a name"); ref.done("REFERENCE_EXPRESSION") }
                    }
                    entry.done("SHORT_STRING_TEMPLATE_ENTRY")
                }
                "LONG_TEMPLATE_ENTRY_START" -> {
                    advance()
                    while (!eof()) {
                        val offset = b.currentOffset; expression()
                        if (consume("LONG_TEMPLATE_ENTRY_END")) break
                        error("Expecting '}'")
                        if (offset == b.currentOffset) advance()
                    }
                    entry.done("LONG_STRING_TEMPLATE_ENTRY")
                }
                else -> { advance(); entry.error("Unexpected token in a string template") }
            }
        }
        if (at("DANGLING_NEWLINE")) errorAdvance("Expecting '\"'") else expect("CLOSING_QUOTE", "Expecting '\"'")
        template.done("STRING_TEMPLATE")
    }
    private val expressionFollow = setOf("EOL", "ARROW", "COMMA", "RBRACE", "RPAR", "RBRACKET")
    private fun contract(): Boolean {
        if (!consume("CONTRACT_KEYWORD")) return false
        val list = mark(); expect("LBRACKET", "Expecting '['"); s.enableNewlines()
        while (true) {
            if (at("COMMA")) errorAdvance("Expecting a contract effect")
            if (at("RBRACKET")) break
            val effect = mark(); expression(); effect.done("CONTRACT_EFFECT")
            if (!consume("COMMA")) break
        }
        expect("RBRACKET", "Expecting ']'"); s.restoreNewlinesState(); list.done("CONTRACT_EFFECT_LIST"); return true
    }
    private val expressionFirst = setOf("MINUS", "PLUS", "MINUSMINUS", "PLUSPLUS", "EXCL", "EXCLEXCL", "COLONCOLON", "LPAR",
        "TRUE_KEYWORD", "FALSE_KEYWORD", "INTERPOLATION_PREFIX", "OPEN_QUOTE", "INTEGER_LITERAL", "CHARACTER_LITERAL", "FLOAT_LITERAL",
        "NULL_KEYWORD", "LBRACE", "FUN_KEYWORD", "THIS_KEYWORD", "SUPER_KEYWORD", "IF_KEYWORD", "WHEN_KEYWORD", "TRY_KEYWORD",
        "OBJECT_KEYWORD", "THROW_KEYWORD", "RETURN_KEYWORD", "CONTINUE_KEYWORD", "BREAK_KEYWORD", "FOR_KEYWORD", "WHILE_KEYWORD", "DO_KEYWORD", "IDENTIFIER", "AT", "LBRACKET")
    private val binaryLevels = listOf(setOf("AS_KEYWORD", "AS_SAFE"), setOf("MUL", "DIV", "PERC"), setOf("PLUS", "MINUS"),
        setOf("RANGE", "RANGE_UNTIL"), setOf("IDENTIFIER") + soft.keys, setOf("ELVIS"), setOf("IN_KEYWORD", "NOT_IN", "IS_KEYWORD", "NOT_IS"),
        setOf("LT", "GT", "LTEQ", "GTEQ"), setOf("EQEQ", "EXCLEQ", "EQEQEQ", "EXCLEQEQEQ"), setOf("ANDAND"), setOf("OROR"),
        setOf("EQ", "PLUSEQ", "MINUSEQ", "MULTEQ", "DIVEQ", "PERCEQ"))
    private fun interrupted() = s.newlineBeforeCurrentToken() && tt() !in setOf("DOT", "SAFE_ACCESS", "COLON", "AS_KEYWORD", "AS_SAFE", "ELVIS", "ANDAND", "OROR")
    private fun expression(message: String = "Expecting an expression") {
        if (!any(expressionFirst)) { error(message); return }
        binaryExpression(binaryLevels.lastIndex)
    }
    private fun operation() { val m = mark(); advance(); m.done("OPERATION_REFERENCE") }
    private fun binaryExpression(max: Int): Int {
        var m = mark(); prefixExpression(); var min = 0
        while (!interrupted()) {
            val op = tt(); val level = binaryLevels.indexOfFirst { op in it }
            if (level < min || level > max || level < 0) break
            if (level == 4 && op in soft) b.remapCurrentToken("IDENTIFIER")
            operation()
            val node = when (op) {
                "AS_KEYWORD", "AS_SAFE" -> { typeRef(false); min = 0; "BINARY_WITH_TYPE" }
                "IS_KEYWORD", "NOT_IS" -> { typeRef(false); min = 6; "IS_EXPRESSION" }
                else -> { min = binaryExpression(level - 1); "BINARY_EXPRESSION" }
            }
            m.done(node); m = m.precede()
        }
        m.drop(); return min
    }
    private fun labelDefinition() {
        if (at("AT")) { errorAdvance("Expecting identifier before '@' in label definition"); return }
        val wrap = mark(); val label = mark()
        expect("IDENTIFIER", "Label must be named"); expect("AT", "Expecting '@'")
        label.done("LABEL"); wrap.done("LABEL_QUALIFIER")
    }
    private fun labelReference() {
        if (!at("AT") || s.newlineBeforeCurrentToken()) return
        if (b.rawLookup(-1) in setOf("WHITE_SPACE", "BLOCK_COMMENT", "DOC_COMMENT", "EOL_COMMENT")) error("There should be no space or comments before '@' in label reference")
        val wrap = mark(); val label = mark()
        if (b.rawLookup(1) != "IDENTIFIER") { errorAdvance("Label must be named"); label.drop(); wrap.drop(); return }
        advance(); advance(); label.done("LABEL"); wrap.done("LABEL_QUALIFIER")
    }
    private fun prefixExpression() {
        if (at("AT")) {
            val m = mark(); annotations(); prefixExpression(); m.done("ANNOTATED_EXPRESSION"); return
        }
        s.disableJoiningComplexTokens()
        when {
            at("IDENTIFIER") && b.rawLookup(1) == "AT" -> {
                s.restoreJoiningComplexTokensState(); val m = mark(); labelDefinition(); prefixExpression(); m.done("LABELED_EXPRESSION")
            }
            tt() in setOf("PLUS", "MINUS", "PLUSPLUS", "MINUSMINUS", "EXCL") -> {
                val m = mark(); operation(); s.restoreJoiningComplexTokensState(); prefixExpression(); m.done("PREFIX_EXPRESSION")
            }
            else -> { s.restoreJoiningComplexTokensState(); postfixExpression() }
        }
    }
    private fun doubleColon(m: SyntaxBuilder.Marker) {
        advance()
        if (consume("CLASS_KEYWORD")) { m.done("CLASS_LITERAL_EXPRESSION"); return }
        val ref = mark(); expect("IDENTIFIER", "Expecting an identifier"); ref.done("REFERENCE_EXPRESSION")
        if (at("LT")) {
            val bad = mark(); typeArguments(); bad.error("Type arguments are not allowed")
        }
        if (at("LPAR") && !s.newlineBeforeCurrentToken()) {
            val bad = mark(); callSuffix()
            bad.error("This syntax is reserved for future use; to call a reference, enclose it in parentheses: (foo::bar)(args)")
        }
        m.done("CALLABLE_REFERENCE_EXPRESSION")
    }
    private fun postfixExpression() {
        var m = mark()
        if (at("COLONCOLON")) doubleColon(mark()) else atomicExpression()
        while (!interrupted()) {
            when {
                at("LBRACKET") -> { collection("INDICES", false, "Expecting an index element"); m.done("ARRAY_ACCESS_EXPRESSION") }
                callSuffix() -> m.done("CALL_EXPRESSION")
                at("DOT") || at("SAFE_ACCESS") -> {
                    val kind = if (at("DOT")) "DOT_QUALIFIED_EXPRESSION" else "SAFE_ACCESS_EXPRESSION"
                    advance(); val selector = mark(); atomicExpression()
                    if (!s.newlineBeforeCurrentToken() && callSuffix()) selector.done("CALL_EXPRESSION") else selector.drop()
                    m.done(kind)
                }
                tt() in setOf("PLUSPLUS", "MINUSMINUS", "EXCLEXCL") -> { operation(); m.done("POSTFIX_EXPRESSION") }
                else -> {
                    if (at("QUEST")) {
                        var k = 1; while (lookahead(k) == "QUEST") k++
                        if (lookahead(k) == "COLONCOLON") repeat(k) { advance() }
                    }
                    if (at("COLONCOLON")) doubleColon(m) else break
                }
            }
            m = m.precede()
        }
        m.drop()
    }
    private fun callSuffix(): Boolean {
        if (closureArguments()) return true
        if (at("LPAR")) { arguments(); closureArguments(); return true }
        if (at("LT")) {
            val attempt = mark()
            if (!typeArguments(setOf("INTEGER_LITERAL", "FLOAT_LITERAL", "CHARACTER_LITERAL", "INTERPOLATION_PREFIX", "OPEN_QUOTE", "PACKAGE_KEYWORD", "AS_KEYWORD", "TYPE_ALIAS_KEYWORD", "INTERFACE_KEYWORD", "CLASS_KEYWORD", "THIS_KEYWORD", "VAL_KEYWORD", "VAR_KEYWORD", "FUN_KEYWORD", "FOR_KEYWORD", "NULL_KEYWORD", "TRUE_KEYWORD", "FALSE_KEYWORD", "IS_KEYWORD", "THROW_KEYWORD", "RETURN_KEYWORD", "BREAK_KEYWORD", "CONTINUE_KEYWORD", "OBJECT_KEYWORD", "IF_KEYWORD", "TRY_KEYWORD", "ELSE_KEYWORD", "WHILE_KEYWORD", "DO_KEYWORD", "WHEN_KEYWORD", "RBRACKET", "RBRACE", "RPAR", "PLUSPLUS", "MINUSMINUS", "EXCLEXCL", "PLUS", "MINUS", "EXCL", "DIV", "PERC", "LTEQ", "EQEQEQ", "EXCLEQEQEQ", "EQEQ", "EXCLEQ", "ANDAND", "OROR", "SAFE_ACCESS", "ELVIS", "SEMICOLON", "RANGE", "RANGE_UNTIL", "EQ", "MULTEQ", "DIVEQ", "PERCEQ", "PLUSEQ", "MINUSEQ", "NOT_IN", "NOT_IS", "COLONCOLON", "COLON"))) { attempt.rollbackTo(); return false }
            attempt.drop()
            if (!s.newlineBeforeCurrentToken() && at("LPAR")) arguments()
            closureArguments(); return true
        }
        return false
    }
    private fun collection(kind: String = "COLLECTION_LITERAL_EXPRESSION", empty: Boolean = true, message: String = "Expecting an element") {
        val m = mark(); s.disableNewlines(); advance()
        if (!empty && at("RBRACKET")) error(message)
        else while (!at("RBRACKET")) { expression(message); if (!consume("COMMA")) break }
        expect("RBRACKET", "Expecting ']'"); s.restoreNewlinesState(); m.done(kind)
    }
    private fun lambda(preferBlock: Boolean = false) {
        val outer = mark(); val literal = mark(); s.enableNewlines(); advance()
        var params = false
        if (at("ARROW")) { mark().done("VALUE_PARAMETER_LIST"); advance(); params = true }
        else if (tt() in setOf("IDENTIFIER", "COLON", "LPAR", "LBRACKET")) {
            val attempt = mark(); val preferParams = lookahead(1) in setOf("COMMA", "COLON"); val list = mark()
            while (!eof() && !at("ARROW")) {
                val p = mark()
                when {
                    at("COLON") -> error("Expecting parameter name")
                    at("LPAR") || at("LBRACKET") -> {
                        val d = mark(); destructuring(setOf("ARROW", "COMMA", "COLON"), if (lookahead(1) == "VAL_KEYWORD") 2 else 0); d.done("DESTRUCTURING_DECLARATION")
                    }
                    else -> expect("IDENTIFIER", "Expecting parameter name", setOf("ARROW"))
                }
                if (consume("COLON")) typeRef()
                p.done("VALUE_PARAMETER")
                if (at("ARROW")) break
                if (!consume("COMMA")) { error("Expecting '->' or ','"); break }
            }
            list.done("VALUE_PARAMETER_LIST")
            if (consume("ARROW")) { params = true; attempt.drop() }
            else if (preferParams && at("RBRACE")) { params = true; attempt.drop(); error("An -> is expected") }
            else attempt.rollbackTo()
        }
        if (!params && preferBlock) {
            literal.drop(); statements(); expect("RBRACE", "Expecting '}'"); outer.done("BLOCK")
        } else {
            val body = mark(); statements(); body.done("BLOCK")
            body.setCustomEdgeTokenBinders(TriviaBinder.PRECEDING_ALL_COMMENTS, TriviaBinder.TRAILING_ALL_COMMENTS)
            expect("RBRACE", "Expecting '}'"); literal.done("FUNCTION_LITERAL"); outer.done("LAMBDA_EXPRESSION")
        }
        s.restoreNewlinesState()
    }
    private fun annotatedLambda(preferBlock: Boolean): Boolean {
        val annotated = mark(); val hasAnnotations = annotations(); val labeled = mark()
        val hasLabel = at("IDENTIFIER") && b.rawLookup(1) == "AT"
        if (hasLabel) labelDefinition()
        if (!at("LBRACE")) { annotated.rollbackTo(); return false }
        lambda(preferBlock)
        if (hasLabel) labeled.done("LABELED_EXPRESSION") else labeled.drop()
        if (hasAnnotations) annotated.done("ANNOTATED_EXPRESSION") else annotated.drop()
        return true
    }
    private var delegationStart: Int? = null
    private fun closureArguments(): Boolean {
        delegationStart?.let { start ->
            var nesting = 0
            for (index in start until b.rawTokenIndex()) {
                when (b.rawLookup(index - b.rawTokenIndex())) {
                    "LPAR", "LBRACKET", "LBRACE" -> nesting++
                    "RPAR", "RBRACKET", "RBRACE" -> nesting--
                }
            }
            if (nesting <= 0) return false
        }
        var found = false
        while (true) {
            val argument = mark()
            if (!annotatedLambda(false)) { argument.drop(); break }
            argument.done("LAMBDA_ARGUMENT"); found = true
        }
        return found
    }
    private fun controlBody() { if (!annotatedLambda(true)) expression() }
    private fun condition() {
        s.disableNewlines()
        if (expect("LPAR", "Expecting a condition in parentheses '(...)'", expressionFirst)) {
            val m = mark(); expression(); m.done("CONDITION"); expect("RPAR", "Expecting ')")
        }
        s.restoreNewlinesState()
    }
    private fun ifExpression() {
        val m = mark(); advance(); condition()
        val then = mark()
        if (!at("ELSE_KEYWORD") && !at("SEMICOLON")) controlBody()
        if (at("SEMICOLON") && lookahead(1) == "ELSE_KEYWORD") advance()
        then.done("THEN")
        if (at("ELSE_KEYWORD") && lookahead(1) != "ARROW") {
            advance(); val branch = mark(); if (!at("SEMICOLON")) controlBody(); branch.done("ELSE")
        }
        m.done("IF")
    }
    private fun loopBody() { val body = mark(); if (!at("SEMICOLON")) controlBody(); body.done("BODY") }
    private fun loop() {
        val token = tt(); val m = mark(); advance()
        when (token) {
            "WHILE_KEYWORD" -> { condition(); loopBody() }
            "DO_KEYWORD" -> {
                if (!at("WHILE_KEYWORD")) loopBody()
                if (expect("WHILE_KEYWORD", "Expecting 'while' followed by a post-condition")) condition()
            }
            "FOR_KEYWORD" -> {
                if (expect("LPAR", "Expecting '(' to open a loop range", expressionFirst)) {
                    s.disableNewlines()
                    if (!at("RPAR")) {
                        val p = mark()
                        if (!at("IN_KEYWORD")) modifierList(stopBefore = setOf("IN_KEYWORD", "RPAR", "COLON"))
                        if (at("VAL_KEYWORD") || at("VAR_KEYWORD")) advance()
                        if (at("LPAR") || at("LBRACKET")) {
                            val d = mark(); destructuring(setOf("IN_KEYWORD", "LBRACE"), if (lookahead(1) == "VAL_KEYWORD") 2 else 0); d.done("DESTRUCTURING_DECLARATION")
                        } else {
                            expect("IDENTIFIER", "Expecting a variable name", setOf("COLON", "IN_KEYWORD"))
                            if (consume("COLON")) typeRef()
                        }
                        p.done("VALUE_PARAMETER")
                        if (expect("IN_KEYWORD", "Expecting 'in'", setOf("LPAR", "LBRACE", "RPAR"))) {
                            val range = mark(); expression(); range.done("LOOP_RANGE")
                        }
                    } else error("Expecting a variable name")
                    expect("RPAR", "Expecting ')'"); s.restoreNewlinesState()
                }
                loopBody()
            }
        }
        m.done(if (token == "DO_KEYWORD") "DO_WHILE" else checkNotNull(token).removeSuffix("_KEYWORD"))
    }
    private fun tryExpression() {
        val m = mark(); advance(); block(); var handled = false
        val recovery = setOf("LBRACE", "RBRACE", "FINALLY_KEYWORD", "CATCH_KEYWORD")
        while (at("CATCH_KEYWORD")) {
            handled = true; val c = mark(); advance()
            if (any(recovery)) error("Expecting exception variable declaration")
            else {
                val params = mark(); expect("LPAR", "Expecting '('", recovery)
                if (!any(recovery)) { parameter(true, false); consume("COMMA"); expect("RPAR", "Expecting ')'", recovery) }
                else error("Expecting exception variable declaration")
                params.done("VALUE_PARAMETER_LIST")
            }
            if (at("LBRACE")) block() else error("Expecting a block: { ... }")
            c.done("CATCH")
        }
        if (at("FINALLY_KEYWORD")) { handled = true; val f = mark(); advance(); block(); f.done("FINALLY") }
        if (!handled) error("Expecting 'catch' or 'finally'")
        m.done("TRY")
    }
    private fun whenExpression() {
        val m = mark(); advance(); s.disableNewlines()
        if (consume("LPAR")) {
            val start = mark(); modifierList(emptySet(), setOf("EQ", "RPAR"))
            if (at("VAL_KEYWORD") || at("VAR_KEYWORD")) close(start, property(true), false)
            else { start.rollbackTo(); expression() }
            expect("RPAR", "Expecting ')'")
        }
        s.restoreNewlinesState(); s.enableNewlines()
        val recovery = setOf("RBRACE", "IN_KEYWORD", "NOT_IN", "IS_KEYWORD", "NOT_IS", "ELSE_KEYWORD")
        if (expect("LBRACE", "Expecting '{'")) {
            while (!eof() && !at("RBRACE")) {
                val offset = b.currentOffset; val entry = mark(); val isElse = consume("ELSE_KEYWORD")
                if (!isElse) while (true) {
                    while (at("COMMA")) errorAdvance("Expecting a when-condition")
                    val c = mark(); s.disableNewlines()
                    when {
                        at("IN_KEYWORD") || at("NOT_IN") -> {
                            operation(); if (any(recovery + setOf("ARROW", "DOT"))) error("Expecting an element") else expression()
                            c.done("WHEN_CONDITION_IN_RANGE")
                        }
                        at("IS_KEYWORD") || at("NOT_IS") -> {
                            advance(); if (any(recovery + setOf("ARROW", "DOT"))) error("Expecting a type") else typeRef()
                            c.done("WHEN_CONDITION_IS_PATTERN")
                        }
                        else -> {
                            if (tt() in setOf("RBRACE", "ELSE_KEYWORD", "ARROW", "DOT")) error("Expecting an expression, is-condition or in-condition") else expression()
                            c.done("WHEN_CONDITION_EXPRESSION")
                        }
                    }
                    s.restoreNewlinesState()
                    if (!consume("COMMA") || at("ARROW")) break
                }
                if (at("ANDAND")) errorUntil("Unexpected '&&', use 'if' to introduce additional conditions; see https://kotl.in/guards-in-when", setOf("LBRACE", "RBRACE", "ARROW"))
                else if (at("IF_KEYWORD")) { val g = mark(); advance(); expression(); g.done("WHEN_ENTRY_GUARD") }
                if (isElse) {
                    if (!at("ARROW")) errorUntil("Expecting '->'", setOf("ARROW", "LBRACE", "RBRACE", "EOL"))
                    if (consume("ARROW")) { if (any(recovery)) error("Expecting an element") else controlBody() }
                    else if (at("LBRACE")) controlBody()
                    else if (!any(recovery)) errorAdvance("Expecting '->'")
                } else {
                    expect("ARROW", "Expecting '->'", recovery)
                    if (any(recovery)) error("Expecting an element") else controlBody()
                }
                entry.done("WHEN_ENTRY"); consume("SEMICOLON")
                if (b.currentOffset == offset && !eof() && !at("RBRACE")) errorAdvance("Expecting a when-condition")
            }
            expect("RBRACE", "Expecting '}'")
        }
        s.restoreNewlinesState(); m.done("WHEN")
    }
    private fun atomicExpression() {
        if (at("CONTEXT_KEYWORD") && lookahead(1) == "LPAR") {
            if (localDeclaration(expressionOnly = true)) return
            at("IDENTIFIER")
        }
        val kind = when (tt()) {
            "INTEGER_LITERAL" -> "INTEGER_CONSTANT"
            "FLOAT_LITERAL" -> "FLOAT_CONSTANT"
            "TRUE_KEYWORD", "FALSE_KEYWORD" -> "BOOLEAN_CONSTANT"
            "NULL_KEYWORD" -> "NULL"
            "CHARACTER_LITERAL" -> "CHARACTER_CONSTANT"
            else -> null
        }
        if (kind != null) { val m = mark(); advance(); m.done(kind); return }
        when {
            at("IDENTIFIER") -> { val ref = mark(); advance(); ref.done("REFERENCE_EXPRESSION") }
            at("OPEN_QUOTE") || at("INTERPOLATION_PREFIX") -> stringTemplate()
            at("LBRACKET") -> collection()
            at("LPAR") -> {
                val m = mark(); s.disableNewlines(); advance(); expression(); expect("RPAR", "Expecting ')'"); s.restoreNewlinesState(); m.done("PARENTHESIZED")
            }
            at("THIS_KEYWORD") || at("SUPER_KEYWORD") -> {
                val superType = at("SUPER_KEYWORD"); val m = mark(); val ref = mark(); advance(); ref.done("REFERENCE_EXPRESSION")
                if (superType && at("LT")) {
                    val attempt = mark(); s.disableNewlines(); advance(); typeRef()
                    if (consume("GT")) attempt.drop() else attempt.rollbackTo()
                    s.restoreNewlinesState()
                }
                labelReference(); m.done(if (superType) "SUPER_EXPRESSION" else "THIS_EXPRESSION")
            }
            tt() in setOf("RETURN_KEYWORD", "BREAK_KEYWORD", "CONTINUE_KEYWORD", "THROW_KEYWORD") -> {
                val token = tt(); val m = mark(); advance()
                if (token == "THROW_KEYWORD") expression()
                else { labelReference(); if (token == "RETURN_KEYWORD" && !at("EOL") && any(expressionFirst)) expression() }
                m.done(checkNotNull(token).removeSuffix("_KEYWORD"))
            }
            at("IF_KEYWORD") -> ifExpression()
            at("WHEN_KEYWORD") -> whenExpression()
            at("TRY_KEYWORD") -> tryExpression()
            tt() in setOf("WHILE_KEYWORD", "DO_KEYWORD", "FOR_KEYWORD") -> loop()
            at("LBRACE") -> lambda()
            at("OBJECT_KEYWORD") -> {
                val literal = mark(); val declaration = mark(); classifier(emptySet(), true); declaration.done("OBJECT_DECLARATION"); literal.done("OBJECT_LITERAL")
            }
            tt() in top -> { if (!localDeclaration()) recovery("Expecting an element", expressionFollow) }
            else -> recovery("Expecting an element", expressionFollow + "LONG_TEMPLATE_ENTRY_END")
        }
    }
}
