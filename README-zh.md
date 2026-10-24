# Kotlin Syntax

[English](README.md) | [简体中文](README-zh.md)

Kotlin Syntax 是一个用于 Kotlin 源码解析和语法分类的 Kotlin Multiplatform 库，同时提供基于同一解析器的 VS Code 扩展和在线演示应用。

## 功能

- 将 Kotlin 文件（`.kt`）和脚本（`.kts`）解析为无损语法树，保留空白、注释和语法错误信息。
- 生成带类型的语法分类区间，并通过增量解析更新文档。
- 支持 JVM 和 Wasm，也可将 JVM 库集成到 Android 应用中。
- 在 VS Code 中通过后台 Worker 提供 Kotlin 高亮，或在使用 One Dark Pro 主题的 React 演示应用中体验解析与高亮。

项目通过测试与 Kotlin 官方编译器对比解析结果。高亮基于语法，不包含符号解析或类型检查。已测试的语法与平台范围详见[兼容性与限制](docs/compatibility.md)。

## 模块

| 模块 | 用途 |
| --- | --- |
| [kotlin-parser](kotlin-parser/) | 跨平台解析器、语法树、增量文档与语法分类区间 |
| [kotlin-vscode](kotlin-vscode/) | 在 Worker 中运行解析器的 VS Code 扩展 |
| [kotlin-website](kotlin-website/) | 基于同一解析器的交互式演示应用 |

## 文档

以下详细文档目前为英文。

- [Kotlin 与 Android 集成](docs/kotlin-api.md)
- [本地开发与构建](docs/development.md)
- [项目架构](docs/architecture.md)
- [兼容性与限制](docs/compatibility.md)
- [测试与发布](docs/testing.md)
- [上游升级](docs/upstream-upgrade.md)
- [性能基准](benchmarks/README.md)

## 许可证

[Apache-2.0](LICENSE)。
