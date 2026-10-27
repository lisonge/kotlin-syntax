# What's Changed

## 0.0.8

- Added the Kotlin Multiplatform formatter aligned with ktfmt 0.65, using the shared Kotlin 2.4.21 parser and a portable google-java-format layout engine.
- Added VS Code document formatting for Kotlin files and scripts, with cached results and shared project configuration.
- Added the `kotlin-format` Node.js/WASM CLI with write/check modes, JSON and ESM JS/MJS/TS configuration, and typed configuration exports.
- Published `kotlin-parser` and `kotlin-format` through the shared release workflow with synchronized versions and OIDC authentication; added package installation and usage documentation.
- Replaced the parser's combined root entry with explicit `kotlin-parser/wasm` and lightweight `kotlin-parser/editor` exports.
- Moved upstream reference sources and fixtures to checksum-verified downloads pinned by commit, and centralized JavaScript dependencies in the pnpm catalog.
