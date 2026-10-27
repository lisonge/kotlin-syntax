import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import groovy.json.JsonSlurper

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    `maven-publish`
}

val upstream = JsonSlurper().parse(file("upstream/metadata.json")) as Map<*, *>
val ktfmt = upstream["ktfmt"] as Map<*, *>
val googleJavaFormat = upstream["googleJavaFormat"] as Map<*, *>
val upstreamCases = rootProject.layout.buildDirectory.dir("upstream/ktfmt/${ktfmt["revision"]}/cases")
val prepareUpstreamCases = tasks.register<Exec>("prepareUpstreamCases") {
    group = "verification"
    description = "Download and verify the pinned ktfmt input corpus when needed."
    inputs.file("upstream/metadata.json")
    inputs.file("scripts/prepare-upstream.ts")
    inputs.file(rootProject.file("scripts/upstream.ts"))
    inputs.file(rootProject.file("kotlin-parser/upstream/metadata.json"))
    outputs.dir(upstreamCases)
    commandLine("node", file("scripts/prepare-upstream.ts").absolutePath)
}

@OptIn(org.jetbrains.kotlin.gradle.ExperimentalWasmDsl::class)
kotlin {
    jvmToolchain(21)
    jvm { compilerOptions.jvmTarget.set(JvmTarget.JVM_1_8) }
    wasmJs {
        outputModuleName.set("kotlin-format")
        nodejs()
        useEsModules()
        binaries.executable()
        generateTypeScriptDefinitions()
    }
    sourceSets {
        commonMain.dependencies { implementation(project(":kotlin-parser")) }
        commonTest.dependencies { implementation(libs.kotlin.test) }
        jvmTest.dependencies {
            // Keep ktfmt's parser on the same syntax target as kotlin-parser.
            implementation(libs.kotlin.compiler.get().copy().apply {
                version { strictly(libs.versions.kotlin.get()) }
            })
            implementation("org.jetbrains.kotlinx:ktfmt:${ktfmt["version"]}")
            implementation("com.google.googlejavaformat:google-java-format:${googleJavaFormat["version"]}")
        }
    }
}

tasks.named<Test>("jvmTest") {
    dependsOn(prepareUpstreamCases)
    systemProperty("ktfmt.cases", upstreamCases.get().asFile.absolutePath)
    systemProperty("ktfmt.cases.count", (upstream["files"] as Map<*, *>).size.toString())
    systemProperty("kotlin.syntax.version", libs.versions.kotlin.get())
    inputs.dir(upstreamCases)
    inputs.file("upstream/metadata.json")
    outputs.dir(layout.buildDirectory.dir("oracle"))
}
