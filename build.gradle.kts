import groovy.json.JsonSlurper
import org.jetbrains.kotlin.gradle.targets.wasm.nodejs.WasmNodeJsEnvSpec
import org.jetbrains.kotlin.gradle.targets.wasm.nodejs.WasmNodeJsPlugin
import org.jetbrains.kotlin.gradle.targets.wasm.nodejs.WasmNodeJsRootPlugin

plugins { alias(libs.plugins.kotlin.multiplatform) apply false }

val manifest = JsonSlurper().parse(file("package.json")) as Map<*, *>
val nodeVersion = ((manifest["devEngines"] as Map<*, *>)["runtime"] as Map<*, *>)["version"] as String
allprojects {
    group = "li.songe"
    version = "0.0.0-SNAPSHOT"
    val target = this
    plugins.withType<WasmNodeJsPlugin> {
        target.extensions.configure<WasmNodeJsEnvSpec> { version.set(nodeVersion) }
    }
}
// The root plugin installs its tooling defaults after applying the per-project plugin.
plugins.withType<WasmNodeJsRootPlugin> {
    extensions.configure<WasmNodeJsEnvSpec> { version.set(nodeVersion) }
}
