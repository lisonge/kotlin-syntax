import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    `maven-publish`
}

@OptIn(org.jetbrains.kotlin.gradle.ExperimentalWasmDsl::class)
kotlin {
    jvmToolchain(21)
    jvm { compilerOptions.jvmTarget.set(JvmTarget.JVM_1_8) }
    wasmJs {
        outputModuleName.set("kotlin-parser")
        nodejs()
        useEsModules()
        binaries.executable()
        generateTypeScriptDefinitions()
    }
    sourceSets {
        commonTest.dependencies { implementation(libs.kotlin.test) }
        jvmTest.dependencies { implementation(libs.kotlin.compiler) }
    }
}

tasks.named<Test>("jvmTest") {
    outputs.dir(layout.buildDirectory.dir("oracle"))
}
