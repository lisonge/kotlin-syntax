import type { Request, Result } from './protocol.ts';
import { replacement } from '../../kotlin-vscode/src/protocol.ts';

let parser: typeof import('kotlin-parser') | undefined;
let handle: number | undefined;
let previous = '';
let script = false;
let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<Request>) => {
  queue = queue.then(async () => {
    try {
      parser ??= await import(/* @vite-ignore */ data.moduleUrl);
      const api = parser!;
      const start = performance.now();
      if (handle === undefined || script !== data.script) {
        if (handle !== undefined) api.closeDocument(handle);
        handle = api.openDocument(data.source, data.script);
      } else {
        const edit = replacement(previous, data.source);
        api.applyDocumentEdit(handle, edit.start, edit.end, edit.text);
      }
      previous = data.source;
      script = data.script;
      const spans: number[] = JSON.parse(api.documentHighlights(handle));
      self.postMessage({ version: data.version, spans, elapsed: performance.now() - start } satisfies Result);
    } catch (error) {
      if (parser && handle !== undefined) parser.closeDocument(handle);
      handle = undefined;
      self.postMessage({ version: data.version, error: String(error) } satisfies Result);
    }
  });
};
