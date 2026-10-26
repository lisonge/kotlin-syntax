import * as parser from 'kotlin-parser/wasm';
import { parentPort } from 'node:worker_threads';
import { encodeTokens, type Request, type Response } from './protocol.ts';
const documents = new Map<string, { id: number; source: string; script: boolean; version: number; data?: Uint32Array }>();
const port = parentPort!;
port.postMessage({ kind: 'ready' } satisfies Response);
port.on('message', (message: Request) => {
  if (message.kind === 'close') {
    const state = documents.get(message.key);
    if (state) parser.closeDocument(state.id);
    documents.delete(message.key); return;
  }
  const key = message.kind === 'parse' ? message.snapshot.key : message.key;
  try {
    let state = documents.get(key);
    if (message.kind === 'parse') {
      const { source, script, version } = message.snapshot;
      if (state) parser.closeDocument(state.id);
      documents.delete(key);
      state = { id: parser.openDocument(source, script), source, script, version };
      documents.set(key, state);
    } else {
      if (!state || state.version !== message.baseVersion || state.script !== message.script) {
        port.postMessage({ kind: 'resync', request: message.request } satisfies Response);
        return;
      }
      let start = state.source.length, end = 0, delta = 0;
      for (const edits of message.batches) {
        // Descending ranges within a batch; batches themselves are chronological.
        for (const edit of edits) {
          start = Math.min(start, edit.start);
          end = Math.max(end, edit.end - delta);
          delta += edit.text.length - (edit.end - edit.start);
          state.source = state.source.slice(0, edit.start) + edit.text + state.source.slice(edit.end);
        }
      }
      if (message.batches.some(edits => edits.length)) {
        // One enclosing replacement avoids reparsing once per queued keystroke.
        parser.applyDocumentEdit(state.id, start, end, state.source.slice(start, end + delta));
        state.data = undefined;
      }
      state.version = message.version;
    }
    if (message.symbols) {
      const summary = JSON.parse(parser.documentSymbols(state.id));
      if (message.definitionOffset !== undefined) summary.reference = JSON.parse(parser.documentExternalReference(state.id, message.definitionOffset));
      if (message.definitionOffset !== undefined) summary.query = JSON.parse(parser.documentNavigationQuery(state.id, message.definitionOffset));
      port.postMessage({ kind: 'symbols', request: message.request, version: state.version, data: JSON.stringify(summary) } satisfies Response);
      return;
    }
    let data: Uint32Array<ArrayBuffer>;
    if (message.definitionOffset !== undefined) {
      data = Uint32Array.from(parser.documentDefinitions(state.id, message.definitionOffset));
    } else {
      state.data ??= encodeTokens(state.source, parser.documentClassifications(state.id));
      // Transfer a copy; retain the cached buffer for unchanged-document requests.
      data = state.data.slice();
    }
    port.postMessage({ kind: 'result', request: message.request, version: state.version, data } satisfies Response, [data.buffer]);
  } catch (error) {
    const state = documents.get(key);
    if (state) { try { parser.closeDocument(state.id); } catch {} }
    documents.delete(key);
    port.postMessage({ kind: 'error', request: message.request, error: error instanceof Error ? (error.stack ?? error.message) : String(error) } satisfies Response);
  }
});
