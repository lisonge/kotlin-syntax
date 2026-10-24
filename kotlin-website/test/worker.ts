import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import * as parser from 'kotlin-parser/wasm';

test('website worker transfers typed spans and continues after detached buffers', async () => {
  // Run the actual browser handler with a Node message-port adapter.
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    globalThis.self = {
      postMessage(data, transfer) {
        parentPort.postMessage(data, transfer);
        if (data.spans) parentPort.postMessage({ detached: data.spans.buffer.byteLength === 0 });
      }
    };
    import(workerData).then(() => {
      parentPort.on('message', data => self.onmessage({ data }));
      parentPort.postMessage('ready');
    });
  `, { eval: true, workerData: new URL('../src/parser.worker.ts', import.meta.url).href });
  try {
    await once(worker, 'message');
    let version = 0;
    for (const script of [false, true]) {
      for (const source of ['', 'val x = "😀"\r\n/* comment */', 'val x = "😁"\r\n/* comment */', 'fun broken(', 'val x = 1', 'val x = 1']) {
        const messages: unknown[] = [];
        const completed = new Promise<void>(resolve => {
          const receive = (message: unknown) => {
            messages.push(message);
            if (messages.length === 2 || (typeof message === 'object' && message !== null && 'error' in message)) {
              worker.off('message', receive); resolve();
            }
          };
          worker.on('message', receive);
        });
        worker.postMessage({ kind: 'sync', source, script, version: ++version });
        await completed;
        const [result, transfer] = messages as [{ version: number; spans: Int32Array; error?: string }, { detached: boolean }];
        assert.equal(result.error, undefined);
        assert.equal(result.version, version);
        assert.ok(result.spans instanceof Int32Array);
        assert.equal(transfer.detached, true);
        const id = parser.openDocument(source, script);
        try { assert.deepEqual(result.spans, parser.documentClassifications(id)); }
        finally { parser.closeDocument(id); }
      }
    }
  } finally { await worker.terminate(); }
});

test('website applies composed batches, rejects stale bases and recovers with full snapshots', async () => {
  const { EditorState } = await import('@codemirror/state');
  const worker = new Worker(`
    const {parentPort,workerData} = require('node:worker_threads');
    globalThis.self = {postMessage: (data,transfer) => parentPort.postMessage(data,transfer)};
    import(workerData).then(()=> {
      parentPort.on('message',data => self.onmessage({data}));
      parentPort.postMessage('ready');
    });
  `,{eval:true,workerData:new URL('../src/parser.worker.ts',import.meta.url).href});
  const send = async (message: unknown) => {
    const reply = once(worker,'message'); worker.postMessage(message); return (await reply)[0];
  };
  const check = (result: any, source: string, script = false) => {
    assert.equal(result.error,undefined);
    const id=parser.openDocument(source,script);
    try { assert.deepEqual(result.spans,parser.documentClassifications(id)); }
    finally { parser.closeDocument(id); }
  };
  try {
    await once(worker,'message');
    assert.deepEqual(await send({kind:'edit',baseVersion:0,version:1,edits:[]}),{version:1,resync:true});
    let state=EditorState.create({doc:'val a = "😀"\r\nval b = 20'});
    check(await send({kind:'sync',version:1,source:state.doc.toString(),script:false}),state.doc.toString());
    const first=state.update({changes:[{from:9,to:11,insert:'😁字'},{from:state.doc.length-2,to:state.doc.length,insert:'200'}]});
    state=first.state;
    let pending=first.changes;
    // Compose rapid typing, undo-like deletion and edits inside previous insertions while a request is busy.
    for(const changes of [{from:0,insert:'// title\n'},{from:0,to:9,insert:''},{from:10,to:11,insert:'x'},{from:state.doc.length,insert:'\nval c = 3'}]) {
      const next=state.update({changes}); pending=pending.compose(next.changes); state=next.state;
    }
    const edits: {start:number;end:number;text:string}[]=[];
    pending.iterChanges((start,end,_a,_b,text)=>edits.push({start,end,text:text.toString()}));
    check(await send({kind:'edit',baseVersion:1,version:6,edits:edits.reverse()}),state.doc.toString());
    assert.deepEqual(await send({kind:'edit',baseVersion:2,version:7,edits:[{start:0,end:1,text:'!'}]}),{version:7,resync:true});
    check(await send({kind:'edit',baseVersion:6,version:7,edits:[]}),state.doc.toString());
    const reloaded='println("external")';
    check(await send({kind:'sync',version:10,source:reloaded,script:true}),reloaded,true);
    check(await send({kind:'edit',baseVersion:10,version:11,edits:[{start:0,end:reloaded.length,text:''}]}),'',true);
  } finally { await worker.terminate(); }
});
