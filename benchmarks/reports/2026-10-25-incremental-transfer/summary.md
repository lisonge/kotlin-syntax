# Incremental edit transport — 2026-10-25

Both consumers now send versioned edit ranges after initialization. The result TypedArrays and transferable buffers are unchanged. Kotlin/WASM binaries match exactly between variants.

## Findings

- Request payloads shrink substantially: the 100 KiB tail-edit case drops from 102,507 to 87 bytes for the website and from 102,560 to 130 bytes for VS Code (V8-serialization proxy).
- Small 10 KiB tail edits improve P50 from 1.430 to 1.259 ms on the website and from 1.896 to 1.565 ms in VS Code, about 12% and 17% respectively in this run.
- There is no broad end-to-end speedup. The 100 KiB single-edit P50 is essentially unchanged or slightly slower. Beginning and multi-range edits have P50 regressions of about 0.5–4.4%; do not describe this as a universal latency improvement.
- Website composed bursts improve P50 by about 6%. VS Code eight-request bursts are about 1.5% slower at P50 but have a lower P95. Its client still captures full source locally for recovery, and the Worker still classifies/encodes the full result.
- The website 100 KiB single-edit case shows substantial tail variance in both variants. No statistical significance or rendering/frame-time improvement is claimed.
- Reducing request bytes does not remove parsing, classification, output encoding or result transfer costs. This measurement does not include allocation profiling.
- Earlier exploratory runs were stopped while processing larger full-reparse inputs; their partial console timings are not included in this completed dataset.

## Validation

Build and type checks passed. Fresh runs passed 18 extension/bundle/Worker tests, 5 website tests, 1,069 lexer and 3,065 parser fixture replays, and 14 installed-editor host assertions (development extension, not packaged VSIX). The unchanged Kotlin JVM/WASM test tasks were UP-TO-DATE (18 JVM / 14 WASM tests in their existing reports).

Added coverage includes multi-range edits with changing lengths, CRLF/Unicode, ordered backlogs, cancellation, overflow snapshot fallback, rejected base versions without mutation, 800 deterministic random edits, CodeMirror composition, external disk writes followed by explicit editor reload, and Worker restart recovery. The isolated host test does not validate automatic filesystem watching.

## Environment

Node v26.12.1; Intel(R) Core(TM) i9-14900HX. Three alternating-order rounds, 30 warmups and 100 measured updates per round per variant. Before/after output checksums match for every case. Raw samples and artifact hashes are in incremental-transfer.json. Baseline generated artifacts remain local build outputs.

## Measurements

- Alternating before/after order by round; 300 measured updates per variant after 30 warmups per round.
- Website uses the actual browser handler with a Node message-port adapter; excludes DOM, CodeMirror composition and rendering.
- VS Code uses the actual ParserClient and Worker; includes queue handling, but excludes document.getText(), provider and rendering.
- Website burst models a composed pending transaction; VS Code burst submits eight requests synchronously and awaits the latest.
- Request bytes use V8 serialization as a payload-size proxy, not a browser wire-byte measurement. Initial full snapshots are excluded.
- Beginning and multi-range edits use 10 KiB inputs because full-file reparsing dominates larger cases; 100 KiB cases cover tail edits and bursts.
- Checksums cover every measured result and must match before/after. Kotlin WASM is unchanged.

| Consumer | KiB | Edit | Burst | Before P50 / P95 ms | After P50 / P95 ms | Request bytes before → after |
|---|---:|---|---:|---:|---:|---:|
| website | 10 | end | 1 | 1.430 / 1.736 | 1.259 / 1.411 | 10352 → 87 |
| website | 100 | end | 1 | 10.033 / 57.855 | 10.316 / 59.104 | 102507 → 87 |
| website | 10 | start | 1 | 11.819 / 13.616 | 11.883 / 13.140 | 10352 → 83 |
| website | 10 | batch | 1 | 12.010 / 13.787 | 12.076 / 13.291 | 10352 → 115 |
| website | 100 | end | 8 | 11.490 / 13.790 | 10.786 / 12.497 | 102508 → 89 |
| vscode | 10 | end | 1 | 1.896 / 2.237 | 1.565 / 1.832 | 10405 → 130 |
| vscode | 100 | end | 1 | 12.704 / 14.753 | 12.710 / 15.082 | 102560 → 130 |
| vscode | 10 | start | 1 | 13.695 / 17.709 | 14.005 / 17.078 | 10405 → 126 |
| vscode | 10 | batch | 1 | 13.627 / 18.214 | 14.230 / 16.946 | 10405 → 158 |
| vscode | 100 | end | 8 | 23.886 / 31.609 | 24.237 / 28.399 | 205124 → 488 |
