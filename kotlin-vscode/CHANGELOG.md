# What's Changed

## 0.0.7

- Added Go to Definition for local declarations, imports, and Kotlin workspace sources, including constructors, callable references, named arguments, and supported receiver members.
- Improved single-file highlighting with lexical bindings, type-use evidence, and qualified class/object references while preserving local shadowing.
- Added local definition navigation to the online playground and shared versioned document updates between highlighting and navigation.
- Reduced repeated workspace directory reads and hashing, respected Git ignore rules and excluded directories, and reused analysis when appending trailing whitespace.
- Added a separately identified Dev extension that pauses when the stable extension is enabled, and refreshed the documentation.
