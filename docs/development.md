# Local development and builds

## Kotlin library

Use JDK 21 and the checked-in Gradle Wrapper. Kotlin is pinned in [the version catalog](../gradle/libs.versions.toml). Run commands from the repository root; use `gradlew.bat` instead of `./gradlew` on Windows.

```sh
./gradlew :kotlin-parser:jvmTest
./gradlew :kotlin-parser:publishKotlinMultiplatformPublicationToMavenLocal :kotlin-parser:publishJvmPublicationToMavenLocal
```

The JVM library emits Java 8 bytecode and builds without Node, pnpm, Android SDK or VS Code. No artifact is currently published to Maven Central by this repository's workflow. See [Kotlin and Android integration](kotlin-api.md) for dependency setup, parsing and highlighting examples, and incremental editing.

## Playground and VS Code extension

Use the Node and pnpm versions specified in [package.json](../package.json), along with JDK 21:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test:built
pnpm test:extension
pnpm dev:website
```

`pnpm build` builds all three modules' web/extension assets. Build before typechecking because generated assets supply types. `pnpm test:built` runs JVM/WASM tests, official fixture replay, extension Worker tests and theme tests. `pnpm test:extension` additionally requires an installed VS Code. `pnpm dev:website` starts the playground's development server.

`pnpm generate` regenerates the committed lexer from verified upstream input. See [upstream upgrades](upstream-upgrade.md) for the syntax upgrade procedure.

For focused checks, extension-host configuration and release instructions, see [testing and releases](testing.md).
