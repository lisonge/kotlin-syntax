# Kotlin Syntax

Syntax highlighting for Kotlin `.kt` and `.kts` files, powered by a Kotlin/WASM parser running in a Worker. Colors follow the active VS Code theme. No JVM language server or Gradle project import is needed for highlighting.

Install the VSIX using **Extensions: Install from VSIX**, then open a Kotlin file. The minimum editor version is specified in this extension's package.json. Disable other Kotlin highlighting extensions in the test workspace to evaluate this provider independently.

Supports incomplete and malformed code with parser error recovery. Symbol resolution, type checking and cross-file semantic analysis are not implemented. Parsing failures or a disabled semantic-highlighting setting can prevent coloring; this extension does not include a TextMate fallback.

## Troubleshooting

Run **Kotlin Syntax: Show Logs** to open the dedicated log channel, or select **Kotlin Syntax** in Output after activation. Use **Developer: Set Log Level...** to enable Debug for this channel when request timing is needed. Debug metadata includes request IDs, versions, lengths and script mode; source snapshots and document paths are not deliberately logged. Exception stacks are retained for diagnosis.

Requests time out after 30 seconds. A failed Worker is terminated and later requests can start a fresh one. After three consecutive failures, parsing pauses and a single warning offers logs or restart. Run **Kotlin Syntax: Restart Parser** to clear caches and resume; this also refreshes highlighting. Successful responses reset the failure count. Invalid Kotlin syntax is normal input and does not trigger this mechanism.

## License

Licensed under [Apache-2.0](LICENSE).
