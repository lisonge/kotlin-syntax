import { replacement } from '../../kotlin-parser/dist/index.js';
import type { Node } from './legacy-highlights.ts';
import type { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ParserClient } from '../dist/parser-client.js';
import { encodeTokens } from '../dist/protocol.js';
import { highlights } from './legacy-highlights.ts';
import * as parser from '../dist/parser/kotlin-parser.mjs';
const fixtures: { source: string; script: boolean; tree: Node }[] = JSON.parse(await readFile(new URL('../../kotlin-parser/build/oracle/parser.json', import.meta.url), 'utf8'));
const flat = (tree: Node) => highlights(tree).flatMap(h => [h.start,h.end,h.type,h.modifiers]);
function expected(source: string, script = false) { return encodeTokens(source, flat(JSON.parse(script ? parser.parseScript(source) : parser.parseFile(source)))); }
test('compact WASM output equals legacy classifier on every official fixture', () => {
  for (const { source, script, tree } of fixtures) {
    const id = parser.openDocument(source, script);
    try {
      const spans = parser.documentClassifications(id);
      assert.ok(spans instanceof Int32Array);
      assert.deepEqual([...spans], flat(tree), source.slice(0,100));
    }
    finally { parser.closeDocument(id); }
  }
});
test('line encoding handles CRLF, CR, LF, surrogate pairs and zero-length spans', () => {
  assert.deepEqual([...encodeTokens('a\r\n馃榾\rb\nc', [0,10,11,0])], [0,0,1,11,0,1,0,2,11,0,1,0,1,11,0,1,0,1,11,0]);
  assert.deepEqual([...encodeTokens('', [])], []);
  assert.deepEqual([...encodeTokens('x', [0,0,1,0])], []);
});
test('minimal replacement reconstructs arbitrary UTF-16 snapshots', () => {
  const texts = ['', '馃榾x', '馃榾y', 'a\r\nb', '/*', 'val x = 1'];
  for (const a of texts) for (const b of texts) {
    const edit = replacement(a,b);
    assert.equal(a.slice(0,edit.start) + edit.text + a.slice(edit.end), b);
  }
});
test('worker handles edits, scripts, unchanged requests, close/reopen and multiple documents', async () => {
  const client = new ParserClient();
  try {
    for (const [i, fixture] of fixtures.filter((_,i) => i % 29 === 0).entries()) {
      const snapshot = { key:'one', version:i, source:fixture.source, script:fixture.script };
      assert.deepEqual(await client.request(snapshot), expected(snapshot.source,snapshot.script));
    }
    const snapshot = {key:'one',version:200,source:'class A {}\nclass B {}\nval x = "馃榾"',script:false};
    const first = await client.request(snapshot);
    assert.deepEqual(await client.request(snapshot), first);
    client.close('one');
    assert.deepEqual(await client.request(snapshot), first);
    const parallel = ['one','two','three'].map(key => ({...snapshot,key}));
    const results = await Promise.all(parallel.map(s => client.request(s)));
    results.forEach(r => assert.deepEqual(r,first));
  } finally { await client.dispose(); }
});
test('coalesces bursts, discards obsolete work and releases cancelled requests', async () => {
  const client = new ParserClient();
  try {
    const requests = Array.from({length:30}, (_,i) => client.request({key:'burst',version:i,source:`val x = ${i}`,script:false}));
    const results = await Promise.all(requests);
    assert.ok(results.slice(0,-1).every(r => r === undefined));
    assert.deepEqual(results.at(-1), expected('val x = 29'));
    const abort = new AbortController();
    const pending = client.request({key:'cancel',version:1,source:'val x = 1',script:false},abort.signal);
    abort.abort(); assert.equal(await pending,undefined);
    assert.equal(await client.request({key:'cancel',version:2,source:'x',script:false},abort.signal),undefined);
    const closed = client.request({key:'close',version:1,source:'val x = 3',script:false});
    client.close('close'); assert.equal(await closed,undefined);
    assert.deepEqual(await client.request({key:'close',version:2,source:'val x = 4',script:false}),expected('val x = 4'));
  } finally { await client.dispose(); }
  await assert.rejects(client.request({key:'x',version:0,source:'',script:false}), /disposed/);
});
test('worker startup errors reject queued promises without hanging', async () => {
  const client = new ParserClient(new URL('./missing-worker.ts',import.meta.url));
  try {
    const results = await Promise.allSettled(['a','b'].map(key => client.request({key,version:1,source:'',script:false})));
    assert.ok(results.every(r => r.status === 'rejected'));
  } finally { await client.dispose(); }
});

test('parsing leaves the host event loop available', async () => {
  const client = new ParserClient();
  try {
    const source = Array.from({length:300},(_,i)=>`class C${i}(val x: Int) { fun f() = x + 1 }`).join('\n');
    let completed = false;
    const pending = client.request({key:'responsive',version:1,source,script:false}).then(data=>{completed=true;return data;});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(completed,false,'Main event loop must run while the worker is parsing');
    const result = await pending;
    assert.ok(result && result.length > 0);
  } finally { await client.dispose(); }
});
test('worker failure rejects work and the next request starts a fresh worker', async () => {
  const client = new ParserClient();
  try {
    await client.request({key:'restart',version:1,source:'val x = 1',script:false});
    // Deliberately crash the owned worker to exercise the lifecycle, not a parser error.
    const worker = Reflect.get(client, 'worker') as Worker | undefined;
    assert.ok(worker);
    const terminated = worker.terminate();
    await terminated;
    assert.deepEqual(await client.request({key:'restart',version:2,source:'val x = 2',script:false}),expected('val x = 2'));
  } finally { await client.dispose(); }
});


test('independent highlighting expectations survive malformed kt/kts and sequential edits', async () => {
  const { cases, typing } = await import('./highlight-cases.ts');
  const { tokenTypes } = await import('../../kotlin-parser/dist/index.js');
  const client = new ParserClient();
  function decode(source: string, data: Uint32Array) {
    const lines = source.split(/\r\n|\r|\n/);
    let line = 0, column = 0;
    const result: [string,string,number][] = [];
    for (let i=0;i<data.length;i+=5) {
      const [dl,dc,len,type,mods] = data.slice(i,i+5);
      column = dl ? dc : column+dc; line += dl;
      assert.ok(len>0 && column+len<=lines[line].length);
      result.push([lines[line].slice(column,column+len),tokenTypes[type],mods]);
    }
    return result;
  }
  try {
    for (const script of [false,true]) {
      const id = parser.openDocument('',script);
      let previous = '', version = 0;
      try {
        for (const fixture of [...cases, ...typing.map(source => ({source,expected: [[ 'x','property',source.startsWith('val')?3:1 ]] as [string,string,number][]}))]) {
          const {source,expected} = fixture;
          const edit = replacement(previous,source);
          parser.applyDocumentEdit(id,edit.start,edit.end,edit.text);
          previous = source;
          const compact = encodeTokens(source,parser.documentClassifications(id));
          const worker = await client.request({key:script?'test.kts':'test.kt',version:++version,source,script});
          assert.ok(worker);
          assert.deepEqual(worker,compact);
          const decoded = decode(source,worker);
          for (const wanted of expected) assert.ok(decoded.some(actual => JSON.stringify(actual)===JSON.stringify(wanted)), `${script?'kts':'kt'} ${source}: missing ${JSON.stringify(wanted)}; got ${JSON.stringify(decoded)}`);
        }
        // Each character prefix, deletion back to empty, then recovery on the same document.
        const complete = 'class C { val n = "😀"; fun f(p: Int) = p }';
        for (const source of [...Array.from({length:complete.length+1},(_,i)=>complete.slice(0,i)), ...Array.from({length:complete.length+1},(_,i)=>complete.slice(0,complete.length-i)), complete]) {
          const result = await client.request({key:script?'prefix.kts':'prefix.kt',version:++version,source,script});
          assert.ok(result); decode(source,result);
          if (source.startsWith('class C ')) assert.ok(decode(source,result).some(t=>t[0]==='C' && t[1]==='class' && t[2]===1));
        }
      } finally { parser.closeDocument(id); }
    }
  } finally { await client.dispose(); }
});


test('timeouts release active and queued jobs, circuit breaker pauses, reset recovers', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const dir = await mkdtemp(fileURLToPath(new URL('../build/fault-',import.meta.url)));
  const { pathToFileURL } = await import('node:url');
  const url = pathToFileURL(dir + '/worker.mjs');
  await writeFile(url, `import {parentPort} from 'node:worker_threads'; parentPort.on('message',()=>{});`);
  const logs: string[] = []; let blocked = 0;
  const client = new ParserClient(url,{timeoutMs:150,maxFailures:2,log:(_,message)=>logs.push(message),onBlocked:()=>blocked++});
  const snapshot = {key:'secret-path',version:1,source:'private source',script:false};
  try {
    const results = await Promise.allSettled([client.request(snapshot),client.request({...snapshot,key:'queued'})]);
    assert.ok(results.every(r=>r.status==='rejected'));
    await assert.rejects(client.request(snapshot),/timed out/);
    assert.equal(blocked,1);
    await assert.rejects(client.request(snapshot),/paused/);
    assert.ok(!logs.join('').includes('private source') && !logs.join('').includes('secret-path'));
    await writeFile(url, `import {parentPort} from 'node:worker_threads'; parentPort.on('message',m=>{ if(m.kind==='parse')parentPort.postMessage({kind:'result',request:m.request,version:m.snapshot.version,data:new Uint32Array()}); });`);
    client.restart();
    assert.deepEqual(await client.request(snapshot),new Uint32Array());
    assert.equal(client.blocked,false);
  } finally { await client.dispose(); await rm(dir,{recursive:true,force:true}); }
});

test('repeated startup failures stop automatically and disposal settles pending requests', async () => {
  let blocked = 0;
  const client = new ParserClient(new URL('./missing-worker.ts',import.meta.url),{maxFailures:2,onBlocked:()=>blocked++});
  try {
    for(let i=0;i<2;i++) await assert.rejects(client.request({key:'x',version:i,source:'',script:false}));
    assert.equal(blocked,1);
    await assert.rejects(client.request({key:'x',version:3,source:'',script:false}),/paused/);
    client.restart();
    const pending=client.request({key:'x',version:4,source:'',script:false});
    await client.dispose(); assert.equal(await pending,undefined);
  } finally { await client.dispose(); }
});

test('incremental batches, cancelled requests, queue overflow and snapshot recovery stay in sync', async () => {
  const client = new ParserClient();
  let source = 'val first = "😀"\r\nval second = 20\r\nval third = 30';
  let version = 1;
  const snapshot = () => ({ key: 'edits', version, source, script: false });
  try {
    assert.deepEqual(await client.request(snapshot()), expected(source));
    const worker = Reflect.get(client, 'worker') as Worker;
    const sent: any[] = [];
    const post = worker.postMessage.bind(worker);
    worker.postMessage = ((message: any, ...rest: any[]) => { sent.push(message); post(message, ...rest); }) as typeof worker.postMessage;
    const edit = (edits: { start: number; end: number; text: string }[]) => {
      for (const e of edits.toSorted((a,b) => b.start-a.start)) source = source.slice(0,e.start)+e.text+source.slice(e.end);
      client.change('edits', ++version, edits);
    };
    // One editor transaction: all offsets address the original string, including CRLF and UTF-16.
    edit([{ start: source.indexOf('😀'), end: source.indexOf('😀')+2, text: '字😁' },
      { start: source.indexOf('20'), end: source.indexOf('20')+2, text: '2000' }]);
    assert.deepEqual(await client.request(snapshot()), expected(source));
    assert.equal(sent.at(-1).kind, 'edit');
    assert.equal('snapshot' in sent.at(-1), false);
    const pending = [];
    for (let i=0;i<20;i++) {
      edit([{start:source.length,end:source.length,text:'\nval n'+i+' = '+i}]);
      pending.push(client.request(snapshot()));
    }
    const values = await Promise.all(pending);
    assert.ok(values.slice(0,-1).every(value => value === undefined));
    assert.deepEqual(values.at(-1), expected(source));
    assert.ok(sent.some(message => message.kind === 'edit' && message.batches.length > 1));

    // Cancellation discards a result, not the edits required by the next request.
    edit([{start:0,end:0,text:'// before\n'}]);
    const abort = new AbortController();
    const cancelled = client.request(snapshot(),abort.signal);
    abort.abort();
    edit([{start:source.length,end:source.length,text:'\nval after = 1'}]);
    assert.equal(await cancelled,undefined);
    assert.deepEqual(await client.request(snapshot()),expected(source));

    // Simulate lost Worker state without changing the client's document version.
    post({kind:'close',key:'edits'});
    edit([{start:source.length,end:source.length,text:'\n// recover'}]);
    assert.deepEqual(await client.request(snapshot()),expected(source));
    assert.deepEqual(sent.slice(-2).map(m=>m.kind),['edit','parse']);

    for(let i=0;i<70;i++) edit([{start:source.length,end:source.length,text:' '}]);
    assert.deepEqual(await client.request(snapshot()),expected(source));
    assert.equal(sent.at(-1).kind,'parse');

    // A missed change notification/version gap must fall back to a snapshot.
    source = 'val externallyReloaded = "😀"'; version += 3;
    assert.deepEqual(await client.request(snapshot()),expected(source));
    assert.equal(sent.at(-1).kind,'parse');
    client.restart();
    assert.deepEqual(await client.request(snapshot()),expected(source));
  } finally { await client.dispose(); }
});

test('worker rejects a mismatched edit without mutating its document', async () => {
  const { Worker } = await import('node:worker_threads');
  const { once } = await import('node:events');
  const worker = new Worker(new URL('../dist/parser-worker.js',import.meta.url));
  const send = async (message: unknown) => {
    const reply = once(worker,'message'); worker.postMessage(message); return (await reply)[0];
  };
  try {
    await once(worker,'message');
    const source = 'val value = 1';
    await send({kind:'parse',request:1,snapshot:{key:'x',version:7,source,script:false}});
    assert.deepEqual(await send({kind:'edit',request:2,key:'x',baseVersion:6,version:8,script:false,
      batches:[[{start:0,end:source.length,text:'class Wrong'}]]}),{kind:'resync',request:2});
    const result = await send({kind:'edit',request:3,key:'x',baseVersion:7,version:8,script:false,
      batches:[[{start:source.length-1,end:source.length,text:'2'}]]});
    assert.equal(result.version,8);
    assert.deepEqual(result.data,expected('val value = 2'));
  } finally { await worker.terminate(); }
});

test('queued insertions and deletions across shifting UTF-16 ranges match fresh parsing', async () => {
  const client = new ParserClient();
  let source='class A {}\nval x = "😀"\r\nfun f() = 1',version=1,seed=12345;
  const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  const inserts=['','x','\nval b = 2\n','😀','/*','*/','"','{}'];
  const snapshot=()=>({key:'random',version,source,script:false});
  try {
    await client.request(snapshot());
    for(let group=0;group<100;group++) {
      for(let step=0;step<8;step++) {
        const start=random(source.length+1),end=start+random(source.length-start+1);
        const text=inserts[random(inserts.length)];
        source=source.slice(0,start)+text+source.slice(end);
        client.change('random',++version,[{start,end,text}]);
      }
      assert.deepEqual(await client.request(snapshot()),expected(source),'group '+group);
    }
  } finally {await client.dispose();}
});
