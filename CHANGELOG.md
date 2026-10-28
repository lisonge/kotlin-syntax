# What's Changed

## 0.0.12

- Added KMP expect/actual navigation on declaration names and modifiers, plus Go to Implementation for expected declarations.
- Unified workspace name and type resolution, preserving enclosing scopes, import priority, nested generic types, and context parameter signatures when matching declarations.
- Fixed cross-file navigation through nested receiver types and avoided guessing matches for ambiguous or unavailable signature types.
- Reused candidate summaries throughout each navigation request to prevent repeated parsing when searches exceed the persistent cache capacity.
- Added parser, signature, and installed-editor regression coverage and reproducible workspace navigation benchmarks.
