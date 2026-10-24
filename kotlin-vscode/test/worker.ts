import type { Node } from '../dist/highlights.js';
import type { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ParserClient } from '../dist/parser-client.js';
import { encodeTokens, replacement } from '../dist/protocol.js';
import { highlights } from '../dist/highlights.js';
import * as parser from '../dist/parser/kotlin-parser.mjs';
const fixtures: { source: string; script: boolean; tree: Node }[] = JSON.parse(await readFile(new URL('../../kotlin-parser/build/oracle/parser.json', import.meta.url), 'utf8'));
const flat = (tree: Node) => highlights(tree).flatMap(h => [h.start,h.end,h.type,h.modifiers]);
function expected(source: string, script = false) { return encodeTokens(source, flat(JSON.parse(script ? parser.parseScript(source) : parser.parseFile(source)))); }
test('compact WASM output equals legacy classifier on every official fixture', () => {
  for (const { source, script, tree } of fixtures) {
    const id = parser.openDocument(source, script);
    try { assert.deepEqual(JSON.parse(parser.documentHighlights(id)), flat(tree), source.slice(0,100)); }
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
  const { tokenTypes } = await import('../dist/highlights.js');
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
          const compact = encodeTokens(source,JSON.parse(parser.documentHighlights(id)));
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
    await writeFile(url, `import {parentPort} from 'node:worker_threads'; parentPort.on('message',m=>{ if(m.kind==='parse')parentPort.postMessage({request:m.request,data:new Uint32Array()}); });`);
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
