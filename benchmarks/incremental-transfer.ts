import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { serialize } from 'node:v8';
import { outputDirectory } from './output.ts';

const directory = await outputDirectory();
const samples = 100, warmup = 30, rounds = 3;
const baselineClient = new URL('../kotlin-vscode/build/incremental-before/parser-client.js', import.meta.url);
const currentClient = new URL('../kotlin-vscode/dist/parser-client.js', import.meta.url);
const baselineWebsite = new URL('../kotlin-website/build/incremental-before.ts', import.meta.url);
const currentWebsite = new URL('../kotlin-website/src/parser.worker.ts', import.meta.url);
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const stats = (raw: number[]) => {
  const sorted = raw.toSorted((a,b)=>a-b);
  return { p50Ms: sorted[Math.ceil(sorted.length*.5)-1], p95Ms: sorted[Math.ceil(sorted.length*.95)-1], raw };
};
const results = [];
for (const platform of ['website','vscode'] as const) {
  for (const [size, position, burst] of [[10,'end',1],[100,'end',1],[10,'start',1],[10,'batch',1],[100,'end',8]] as const) {
    let initial = 'val head = 0\n';
    for(let i=0;initial.length<size*1024;i++) initial += 'class Box'+i+'(val value: Int) { fun compute(x: Int) = value + x }\n';
    initial += 'val tail = 0\n';
    const offsets = position === 'batch' ? [initial.indexOf('0'), initial.lastIndexOf('0')] :
      [position === 'start' ? initial.indexOf('0') : initial.lastIndexOf('0')];
    const timings: number[][] = [[],[]], checksums: string[] = [], payload: number[] = [];
    for(let round=0;round<rounds;round++) {
      for(const variant of round%2 ? [1,0] : [0,1]) {
        let version=1, source=initial;
        const digest=createHash('sha256');
        let client: any, worker: Worker;
        if(platform==='vscode') {
          const module = await import((variant ? currentClient : baselineClient).href);
          client = new module.ParserClient();
          await client.request({key:'benchmark',version,source,script:false});
          worker = Reflect.get(client,'worker');
        } else {
          worker = new Worker(`
            const {parentPort,workerData} = require('node:worker_threads');
            globalThis.self = {postMessage: (data,transfer) => parentPort.postMessage(data,transfer)};
            import(workerData).then(()=>{
              parentPort.on('message',data => self.onmessage({data}));
              parentPort.postMessage('ready');
            });
          `,{eval:true,workerData:(variant?currentWebsite:baselineWebsite).href});
          await once(worker,'message');
          const reply=once(worker,'message');
          worker.postMessage(variant ? {kind:'sync',version,source,script:false} : {version,source,script:false});
          await reply;
        }
        const post=worker.postMessage.bind(worker);
        let messages: unknown[]=[];
        worker.postMessage=((message: unknown,...rest: any[])=>{ messages.push(message); post(message,...rest); }) as typeof worker.postMessage;
        try {
          for(let iteration=0;iteration<warmup+samples;iteration++) {
            messages=[];
            const start=performance.now();
            let data: Int32Array | Uint32Array;
            if(platform==='vscode') {
              const pending=[];
              for(let step=0;step<burst;step++) {
                const text=String((iteration*burst+step+1)%10);
                const edits=offsets.map(offset=>({start:offset,end:offset+1,text}));
                for(const edit of edits.toReversed()) source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
                version++;
                if(variant) client.change('benchmark',version,edits);
                pending.push(client.request({key:'benchmark',version,source,script:false}));
              }
              data=(await Promise.all(pending)).at(-1)!;
            } else {
              const baseVersion=version;
              // This models the composed pending transaction delivered after a busy Worker.
              const text=String(((iteration+1)*burst)%10);
              const edits=offsets.map(offset=>({start:offset,end:offset+1,text})).reverse();
              for(const edit of edits) source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
              version+=burst;
              const reply=once(worker,'message');
              worker.postMessage(variant ? {kind:'edit',baseVersion,version,edits} : {version,source,script:false});
              const [result]=await reply;
              assert.equal(result.error,undefined);
              data=result.spans;
            }
            const elapsed=performance.now()-start;
            assert.ok(data);
            if(iteration>=warmup) {
              timings[variant].push(elapsed);
              digest.update(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
              if(iteration===warmup) payload[variant]=messages.reduce<number>((sum,message)=>sum+serialize(message).byteLength,0);
            }
          }
          const checksum=digest.digest('hex');
          if(checksums[variant]) assert.equal(checksums[variant],checksum);
          checksums[variant]=checksum;
        } finally {
          if(client) await client.dispose(); else await worker.terminate();
        }
      }
      assert.equal(checksums[0],checksums[1],platform+'/'+size+'/'+position+'/'+burst);
    }
    const before=stats(timings[0]),after=stats(timings[1]);
    results.push({platform,sizeKiB:size,sourceLength:initial.length,position,burst,sourceHash:hash(initial),checksum:checksums[0],serializedRequestBytes:payload,before,after});
    await writeFile(new URL('incremental-transfer-progress.json',directory),JSON.stringify(results,null,2)+'\n');
    console.log(platform,size,position,'burst='+burst,'p50/p95',before.p50Ms.toFixed(3),before.p95Ms.toFixed(3),'->',after.p50Ms.toFixed(3),after.p95Ms.toFixed(3),'bytes',payload.join(' -> '));
  }
}
const report={date:new Date().toISOString(),node:process.version,cpu:cpus()[0].model,samples,warmup,rounds,
  notes:['Alternating before/after order by round; 300 measured updates per variant after 30 warmups per round.',
    'Website uses the actual browser handler with a Node message-port adapter; excludes DOM, CodeMirror composition and rendering.',
    'VS Code uses the actual ParserClient and Worker; includes queue handling, but excludes document.getText(), provider and rendering.',
    'Website burst models a composed pending transaction; VS Code burst submits eight requests synchronously and awaits the latest.',
    'Request bytes use V8 serialization as a payload-size proxy, not a browser wire-byte measurement. Initial full snapshots are excluded.',
    'Beginning and multi-range edits use 10 KiB inputs because full-file reparsing dominates larger cases; 100 KiB cases cover tail edits and bursts.',
    'Checksums cover every measured result and must match before/after. Kotlin WASM is unchanged.'],
  hashes: await Promise.all([baselineClient,currentClient,new URL('../kotlin-vscode/build/incremental-before/parser-worker.js',import.meta.url),new URL('../kotlin-vscode/dist/parser-worker.js',import.meta.url),baselineWebsite,currentWebsite,new URL('../kotlin-vscode/build/incremental-before/parser/kotlin-parser.wasm',import.meta.url),new URL('../kotlin-parser/dist/kotlin-parser.wasm',import.meta.url)].map(async url=>({file:url.pathname,sha256:hash(await readFile(url))}))),results};
await writeFile(new URL('incremental-transfer.json',directory),JSON.stringify(report,null,2)+'\n');
const lines=['# Incremental edit transport benchmark','',...report.notes.map(note=>'- '+note),'',
  '| Consumer | KiB | Edit | Burst | Before P50 / P95 ms | After P50 / P95 ms | Request bytes before → after |',
  '|---|---:|---|---:|---:|---:|---:|',
  ...results.map(r=>'| '+r.platform+' | '+r.sizeKiB+' | '+r.position+' | '+r.burst+' | '+r.before.p50Ms.toFixed(3)+' / '+r.before.p95Ms.toFixed(3)+' | '+r.after.p50Ms.toFixed(3)+' / '+r.after.p95Ms.toFixed(3)+' | '+r.serializedRequestBytes.join(' → ')+' |')];
await writeFile(new URL('incremental-transfer.md',directory),lines.join('\n')+'\n');
