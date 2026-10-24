# What's Changed

## 0.0.2

- Added a dedicated **Kotlin Syntax** log channel and **Show Logs** command for Worker lifecycle, WASM loading and error details.
- Added **Restart Parser** to clear parser state and refresh highlighting without reloading VS Code.
- Added a 30-second request timeout and automatic pausing after three consecutive failures, with a single notification offering logs or restart.
- Added debug-level request timing and metadata without deliberately logging source text or document paths.
- Added fault-recovery tests for Worker startup failures, timeouts, queued requests, disposal and manual recovery. Malformed and incomplete Kotlin remain normal input.
