import type { Request, Result } from './protocol.ts';

let parser: typeof import('kotlin-parser/wasm') | undefined;
let handle: number | undefined;
let version: number | undefined;
let source = '';
// The editor sends one request at a time and composes unsent changes.
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    const api = parser ??= await import('kotlin-parser/wasm');
    const start = performance.now();
    if (data.kind === 'sync') {
      if (handle !== undefined) api.closeDocument(handle);
      handle = undefined;
      handle = api.openDocument(data.source, data.script);
      source = data.source;
    } else {
      if (handle === undefined || version !== data.baseVersion) {
        self.postMessage({ version: data.version, resync: true } satisfies Result);
        return;
      }
      // Ranges are in the pre-edit document, ordered from highest offset down.
      if (data.edits.length) {
        const start = data.edits.at(-1)!.start, end = data.edits[0].end;
        let text = source.slice(start, end);
        for (const edit of data.edits) text = text.slice(0, edit.start - start) + edit.text + text.slice(edit.end - start);
        api.applyDocumentEdit(handle, start, end, text);
        source = source.slice(0, start) + text + source.slice(end);
      }
    }
    version = data.version;
    const spans = api.documentClassifications(handle);
    self.postMessage({ version, spans, elapsed: performance.now() - start } satisfies Result, { transfer: [spans.buffer] });
  } catch (error) {
    if (parser && handle !== undefined) parser.closeDocument(handle);
    handle = undefined;
    version = undefined;
    self.postMessage({ version: data.version, error: String(error) } satisfies Result);
  }
};
