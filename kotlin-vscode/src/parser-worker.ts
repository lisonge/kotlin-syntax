import { parentPort } from 'node:worker_threads';
import { encodeTokens, replacement, type Request, type Response } from './protocol.ts';
const parser = await import('./parser/kotlin-parser.mjs');
const documents = new Map<string, { id: number; source: string; script: boolean; data?: Uint32Array }>();
const port = parentPort!;
port.postMessage({request:0,ready:true} satisfies Response);
port.on('message', (message: Request) => {
  if (message.kind === 'close') {
    const state = documents.get(message.key);
    if (state) parser.closeDocument(state.id);
    documents.delete(message.key); return;
  }
  const { key, source, script } = message.snapshot;
  try {
    let state = documents.get(key);
    if (state && state.script !== script) { parser.closeDocument(state.id); documents.delete(key); state = undefined; }
    if (!state) {
      state = { id: parser.openDocument(source, script), source, script };
      documents.set(key, state);
    } else if (state.source !== source) {
      const edit = replacement(state.source, source);
      parser.applyDocumentEdit(state.id, edit.start, edit.end, edit.text);
      state.source = source; state.data = undefined;
    }
    state.data ??= encodeTokens(source, JSON.parse(parser.documentHighlights(state.id)));
    // Transfer a copy; retain the cached buffer for unchanged-document requests.
    const data = state.data.slice();
    port.postMessage({ request: message.request, data } satisfies Response, [data.buffer]);
  } catch (error) {
    const state = documents.get(key);
    if (state) { try { parser.closeDocument(state.id); } catch {} }
    documents.delete(key);
    port.postMessage({ request: message.request, error: error instanceof Error ? (error.stack ?? error.message) : String(error) } satisfies Response);
  }
});
