# What's Changed

## 0.0.11

- Reduced repeated filesystem queries in batch CLI runs by reusing project roots and resolved formatting options within each invocation.
- Preserved directory-specific configuration, package boundaries, explicit overrides, and per-file error reporting with additional regression tests.
- Added reproducible CLI startup, formatting, cache, and filesystem benchmarks with fresh-process samples and output verification.
