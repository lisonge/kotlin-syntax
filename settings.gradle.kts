pluginManagement { repositories { gradlePluginPortal(); mavenCentral() } }
dependencyResolutionManagement { repositories { mavenCentral() } }
rootProject.name = "vscode-kotlin-syntax"
include(":kotlin-parser")
