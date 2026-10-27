import { parentPort } from 'node:worker_threads';
import { formatWithOptions } from 'kotlin-format/wasm';
import { resolveOptions } from 'kotlin-format/config';
import type { FormatRequest, FormatReply } from './format-client.ts';

parentPort!.on('message', (request: FormatRequest & { id: number }) => {
  let reply: FormatReply;
  try {
    const o = resolveOptions(request);
    reply = { id: request.id, text: formatWithOptions(request.source, o.maxWidth, o.blockIndent, o.continuationIndent,
      o.trailingCommas, o.removeUnusedImports, o.preserveLambdaBreaks, request.script) };
  } catch (error) {
    reply = { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
  parentPort!.postMessage(reply);
});
