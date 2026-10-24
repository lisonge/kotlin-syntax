// The pinned compiler's test environment is an internal API, isolated to the JVM oracle.
@file:Suppress("OPT_IN_USAGE_ERROR")
@file:OptIn(org.jetbrains.kotlin.config.CompilerConfiguration.Internals::class)

package li.songe.kotlin.builder

import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment
import org.jetbrains.kotlin.config.CompilerConfiguration
import org.jetbrains.kotlin.cli.extensionsStorage
import org.jetbrains.kotlin.compiler.plugin.CompilerPluginRegistrar
import org.jetbrains.kotlin.com.intellij.lang.PsiBuilder
import org.jetbrains.kotlin.com.intellij.lang.PsiBuilderFactory
import org.jetbrains.kotlin.com.intellij.lang.LighterASTNode
import org.jetbrains.kotlin.com.intellij.lang.impl.PsiBuilderImpl
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer
import org.jetbrains.kotlin.com.intellij.openapi.util.Ref
import org.jetbrains.kotlin.com.intellij.psi.tree.IElementType
import org.jetbrains.kotlin.com.intellij.util.diff.FlyweightCapableTreeStructure
import org.jetbrains.kotlin.lexer.KotlinLexer
import org.jetbrains.kotlin.lexer.KtTokens
import org.jetbrains.kotlin.parsing.KotlinParserDefinition
import org.jetbrains.kotlin.KtNodeTypes
import li.songe.kotlin.tree.SyntaxNode

/** A separate JVM implementation supplies the oracle; no production dependency on IntelliJ. */
object OfficialBuilder {
    fun <T> withBuilder(source: String, action: (PsiBuilder) -> T): T {
        val disposable = Disposer.newDisposable()
        try {
            val configuration = CompilerConfiguration().apply { extensionsStorage = CompilerPluginRegistrar.ExtensionStorage() }
            KotlinCoreEnvironment.createForProduction(disposable, configuration, EnvironmentConfigFiles.JVM_CONFIG_FILES)
            val builder = PsiBuilderFactory.getInstance().createBuilder(KotlinParserDefinition(), KotlinLexer(), source)
            builder.setDebugMode(true)
            return action(builder)
        } finally { Disposer.dispose(disposable) }
    }
    val tokens: Map<String, IElementType> = KtTokens::class.java.fields
        .filter { IElementType::class.java.isAssignableFrom(it.type) }
        .associate { it.name to it.get(null) as IElementType }
    private val nodes: Map<String, IElementType> = KtNodeTypes::class.java.fields
        .filter { IElementType::class.java.isAssignableFrom(it.type) }
        .associate { it.name to it.get(null) as IElementType }
    fun type(kind: String): IElementType = nodes[kind] ?: tokens[kind] ?: IElementType(kind, null)
    fun normalize(node: SyntaxNode): SyntaxNode = node.copy(kind = type(node.kind).toString(), children = node.children.map(::normalize))
    fun tree(tree: FlyweightCapableTreeStructure<LighterASTNode>): SyntaxNode {
        fun node(value: LighterASTNode): SyntaxNode {
            val ref = Ref<Array<LighterASTNode>>()
            val count = tree.getChildren(value, ref)
            val children = ref.get()
            val result = SyntaxNode(value.tokenType.toString(), value.startOffset, value.endOffset,
                (0 until count).map { node(children[it]) }, PsiBuilderImpl.getErrorMessage(value))
            if (children != null) tree.disposeChildren(children, count)
            return result
        }
        return node(tree.root)
    }
}
