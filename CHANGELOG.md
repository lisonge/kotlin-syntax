# What's Changed

## 0.0.10

- Added opt-in persistent caching to the `kotlin-format` CLI with `--cache` and `--cache-location` for file-based write/check runs.
- Cache entries track source content, resolved formatting options, script mode, and formatter/Node versions; fully cached runs skip WASM initialization.
- Preserved upstream single-pass formatting behavior by caching only files verified to need no changes, with regression coverage for restored content and independent directory configurations.
- Serialized parser and formatter builds to avoid concurrent Gradle processes writing the same parser output directory.
