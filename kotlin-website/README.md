# Kotlin website

Vite + React TypeScript + Tailwind playground with a CodeMirror editor and the official One Dark Pro theme rules (https://github.com/Binaryify/OneDark-Pro). Highlighting comes from this workspace's Kotlin WASM parser in a browser Worker, including incremental edits and `.kt` / `.kts` modes.

From the repository root:

```sh
pnpm install
pnpm dev:website
```

`pnpm build` builds the parser before the website. To build only this package and its dependencies, use `pnpm --filter kotlin-website... build`. Preview the production output with `pnpm --filter kotlin-website preview`.

Requires a browser supporting Wasm GC and exception handling. Code stays in memory in the browser; reloading restores the example. Highlighting classifies syntax, without symbol resolution or type checking. The status bar reports parse/highlight time, excluding Worker transport and rendering.

The Worker imports `kotlin-parser/wasm` directly. Vite tracks the generated Kotlin modules and emits the referenced WASM asset with a hashed filename; no parser assets are copied to `public/`. Relative URLs support deployment under a subdirectory. No remote service is required.

The English UI lists all 19 token types and 5 modifiers shared with the VS Code extension. The pinned upstream theme, source commit and MIT license are in `vendor/one-dark-pro/`. Token styling applies the theme's semantic selectors for Kotlin, then VS Code's built-in single-scope TextMate fallback probes, including readonly variables/properties. Editor colors also come from the theme. Run `pnpm --filter kotlin-website test` for mapping regression checks.

This aligns the default semantic-token theme mapping for this extension. It does not reproduce VS Code's entire rendering pipeline: other Kotlin extensions may add TextMate grammars or different semantic classifications; user color overrides, theme variants, bracket colors and font settings can change the result. The website does not perform TextMate grammar tokenization or read local VS Code settings.
