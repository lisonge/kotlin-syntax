plugins { alias(libs.plugins.kotlin.multiplatform) }

@OptIn(org.jetbrains.kotlin.gradle.ExperimentalWasmDsl::class)
kotlin {
    jvmToolchain(21)
    jvm()
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
