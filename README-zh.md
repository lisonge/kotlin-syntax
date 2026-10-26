# Kotlin Syntax

[English](README.md) | [简体中文](README-zh.md)

[在线演示](https://kotlin-syntax.pages.dev) | [安装 VS Code 扩展](https://marketplace.visualstudio.com/items?itemName=lisonge.kotlin-vscode)

Kotlin Syntax 是一个用于 Kotlin 源码解析和语法分类的 Kotlin Multiplatform 库，同时提供基于同一解析器的 VS Code 扩展和在线演示应用。

<img referrerpolicy="no-referrer" alt="使用 One Dark Pro 主题的网页演示应用中的 Kotlin 高亮" src="https://github.com/user-attachments/assets/a0150858-991f-4b0e-a135-c72bd19e647a" />

## 功能

- **解析**：将 `.kt` 文件和 `.kts` 脚本解析为无损语法树，保留空白、注释和语法错误。解析器遵循 Kotlin 官方解析流程，并与固定版本的官方编译器进行差分测试。增量文档支持编辑后更新。库支持 JVM 和 Wasm，Android 应用可使用 JVM 库。
- **高亮**：结合语法、本文件声明、显式类型和受支持的用法推断。高亮分析限定在当前文件内，不扫描工作区。两个编辑器使用相同的分类结果；VS Code 跟随所选主题，在线演示使用 One Dark Pro。
- **跳转**：查找本文件声明、受支持的成员、函数引用和命名参数。VS Code 还可根据包名和 import 信息按需查找工作区 Kotlin 源码。有歧义的结果保留为候选；显式导入未找到目标时，可保留 import 跳转。

| 能力 | VS Code 扩展 | 在线演示 |
| --- | --- | --- |
| 高亮与文档更新 | 支持，在后台 Worker 中运行 | 支持，在后台 Worker 中运行 |
| 本文件定义跳转 | 支持 | 支持 |
| 工作区源码跳转 | 支持，按需查找 | 不支持 |

项目不提供编译器级类型检查、完整类型推断或 Gradle 依赖解析。已测试的语法目标与分析范围详见[兼容性与限制](docs/compatibility.md)。安装、高亮规则和跳转行为见[扩展使用说明](kotlin-vscode/README.md)。

## 模块

| 模块 | 用途 |
| --- | --- |
| [kotlin-parser](kotlin-parser/) | 跨平台解析器、语法树、增量文档、分类与单文件跳转 |
| [kotlin-vscode](kotlin-vscode/) | 在 Worker 中运行解析器，提供 VS Code 高亮与定义跳转 |
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
