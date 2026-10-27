pluginManagement { repositories { gradlePluginPortal(); mavenCentral() } }
dependencyResolutionManagement { repositories { mavenCentral() } }
rootProject.name = "kotlin-syntax"
include(":kotlin-parser")
include(":kotlin-format")
