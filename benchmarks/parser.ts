import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { outputDirectory } from './output.ts';
import { highlights } from '../kotlin-vscode/dist/highlights.js';
import { encodeTokens } from '../kotlin-vscode/dist/protocol.js';
import { ParserClient } from '../kotlin-vscode/dist/parser-client.js';
const directory = await outputDirectory();
const mode = process.argv[2];
if (!mode) {
  for (const variant of ['legacy', 'compact', 'worker']) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), variant], { stdio: 'inherit', env: process.env });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    if (code !== 0) throw new Error(`${variant} failed: ${code}`);
  }
  const reports = await Promise.all(['legacy','compact','worker'].map(async mode => JSON.parse(await readFile(new URL(`comparison-${mode}.json`, directory), 'utf8'))));
  const [legacy, compact, worker] = reports;
  const lines = ['# Performance comparison', '', `Node ${legacy.node}; ${legacy.cpu}. Each mode runs in a separate process, sequentially.`, '',
    'Observed medians below include parsing, classification and token encoding. Worker timings also include scheduling, snapshot cloning and result transfer.', '',
    '| Input / operation | Legacy ms | Compact ms | Worker ms | Legacy timer P95 ms | Worker timer P95 ms |', '|---|---:|---:|---:|---:|---:|'];
  for (let i=0; i<legacy.results.length; i++) {
    const a=legacy.results[i], b=compact.results[i], c=worker.results[i];
    if (a.sha256 !== b.sha256 || a.sha256 !== c.sha256) throw new Error('Input mismatch');
    for (const operation of ['full','front','tail','cached','burst']) {
      if (!a[operation]) continue;
      if (a[operation].checksum !== b[operation].checksum || a[operation].checksum !== c[operation].checksum) throw new Error(`Output mismatch: ${a.name}/${operation}`);
      lines.push(`| ${a.name} / ${operation} | ${a[operation].p50Ms.toFixed(2)} | ${b[operation].p50Ms.toFixed(2)} | ${c[operation].p50Ms.toFixed(2)} | ${a[operation].timerP95Ms.toFixed(2)} | ${c[operation].timerP95Ms.toFixed(2)} |`);
    }
  }
  lines.push('', '## Method and limits', '',
    '- Synthetic inputs contain many small declarations; parser-source is the project parser source with one appended sentinel declaration.',
    '- Front edits change one package-name character (full reparse); tail edits change the appended sentinel (suffix reparse).',
    '- Full requests open a fresh document. Cached requests do not change source. Bursts submit 30 snapshots without waiting; the legacy path processes all, while the worker keeps only running/latest work.',
    '- Timer P95 is the delay of a zero-delay timer armed immediately before each request. It measures main-thread availability, not editor frame time or complete user-visible latency.',
    '- Default: 20 measured samples for 10 KiB, 5 for larger files, after 2 warmups. Large-file percentiles are exploratory; P95/P99 with five samples are simply the maximum.',
    '- Cold-first-result times and sampled peak process RSS are in JSON. Only the first input includes Worker startup; later inputs reuse a warm runtime. Static module imports/process launch are not included, and dynamic WASM module load is recorded separately. RSS includes V8/WASM caches and all threads; it is not retained-memory/leak measurement. OS scheduling and GC affect results.',
    '- Legacy intentionally retains both full-tree serializations from the former edit path. Compact uses the same parser and incremental policy with numeric spans. Worker also caches encoded unchanged results.',
    '- No parser algorithms or grammar behavior were optimized in this experiment.');
  await writeFile(new URL('comparison.md', directory), lines.join('\n')+'\n');
  console.log(lines.join('\n')); process.exit(0);
}
if (!['legacy','compact','worker'].includes(mode)) throw new Error('Unknown mode');
const started = performance.now();
const parser = mode === 'worker' ? undefined : await import('../kotlin-vscode/dist/parser/kotlin-parser.mjs');
const client = mode === 'worker' ? new ParserClient() : undefined;
const moduleLoadMs = performance.now() - started;
const hash = (value: string | Uint32Array) => createHash('sha256').update(value).digest('hex');
const source = (size: number) => {
  let text = 'package benchmark\n';
  for (let i=0; text.length<size; i++) text += `/** item ${i} */\nclass Box${i}(val value: Int) { fun compute(x: Int): Int = value + x }\n`;
  return text;
};
const sources = [['synthetic-10KiB', source(10240)], ['synthetic-100KiB', source(102400)],
  ['parser-source', (await readFile(new URL('../kotlin-parser/src/commonMain/kotlin/li/songe/kotlin/parsing/KotlinParser.kt',import.meta.url),'utf8')).replaceAll('\r\n','\n')]]
  .map(([name,text]) => [name,text+'\nval benchmarkSentinel = 100000\n']);
const percentile = (a: number[], p: number) => [...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.ceil(a.length*p)-1)];
async function measure(action: (iteration: number) => Uint32Array | Promise<Uint32Array | undefined>, samples: number): Promise<Measurement> {
  for (let i=0;i<2;i++) await action(i);
  const times: number[]=[], stalls: number[]=[]; let output: Uint32Array | undefined, peakRss=0;
  for (let i=0;i<samples;i++) {
    const start=performance.now();
    const tick=new Promise<number>(resolve=>setTimeout(()=>resolve(performance.now()-start),0));
    output=await action(i+2); times.push(performance.now()-start); stalls.push(await tick);
    peakRss=Math.max(peakRss,process.memoryUsage().rss);
  }
  if (!output) throw new Error('Benchmark request produced no result');
  return {samples,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),p99Ms:percentile(times,.99),timerP95Ms:percentile(stalls,.95),peakProcessRssMiB:peakRss/1048576,checksum:hash(output),outputBytes:output.byteLength};
}
let version=0;
interface Measurement {
  samples: number; p50Ms: number; p95Ms: number; p99Ms: number;
  timerP95Ms: number; peakProcessRssMiB: number; checksum: string; outputBytes: number;
  wasmPayloadBytes?: number | null;
}
interface BenchmarkRow {
  name: string; utf16Length: number; sha256: string; coldFirstResultMs: number; full: Measurement;
  front?: Measurement; tail?: Measurement; cached?: Measurement; burst?: Measurement;
}
const results: BenchmarkRow[]=[];
try {
  for (const [name,original] of sources) {
    const samples=Number(original.length<20000 ? process.env.BENCH_SAMPLES??20 : process.env.BENCH_LARGE_SAMPLES??5);
    let id: number | undefined; let text=original, payloadBytes=0;
    async function close() { if(client) client.close(name); else if(id!==undefined) {parser!.closeDocument(id);id=undefined;} }
    async function request(next: string, edit?: { start: number; end: number; text: string }) {
      text=next;
      if(client) return await client.request({key:name,version:++version,source:next,script:false});
      if (!parser) throw new Error('Missing parser');
      if(id===undefined) id=parser.openDocument(next,false);
      else if(edit) {
        if(mode==='legacy') parser.editDocument(id,edit.start,edit.end,edit.text);
        else parser.applyDocumentEdit(id,edit.start,edit.end,edit.text);
      }
      const json=mode==='legacy'?parser.documentTree(id):parser.documentHighlights(id);
      payloadBytes=Buffer.byteLength(json);
      const spans=mode==='legacy'?highlights(JSON.parse(json)).flatMap(h=>[h.start,h.end,h.type,h.modifiers]):JSON.parse(json);
      return encodeTokens(next,spans);
    }
    console.log(mode,name,'cold/full');
    const cold=performance.now(); await request(original); const coldFirstResultMs=performance.now()-cold;
    const full=await measure(async()=>{await close();return request(original);},samples);
    const row: BenchmarkRow={name,utf16Length:original.length,sha256:hash(original),coldFirstResultMs,full};
    for(const position of ['front','tail'] as const) {
      console.log(mode,name,position); await close(); await request(original);
      const offset=position==='front'?original.indexOf('package ')+8:original.lastIndexOf('100000');
      row[position]=await measure(i=>{
        const replacement=position==='front'?(i%2?'a':'b'):(i%2?'2':'3');
        const next=text.slice(0,offset)+replacement+text.slice(offset+1);
        return request(next,{start:offset,end:offset+1,text:replacement});
      },samples);
      row[position]!.wasmPayloadBytes=client?null:payloadBytes;
    }
    row.cached=await measure(()=>request(text),samples);
    if(original.length<20000) {
      console.log(mode,name,'burst');
      row.burst=await measure(async i=>{
        const offset=original.lastIndexOf('100000'); const pending=[];
        for(let n=0;n<30;n++) {
          const replacement=String((i+n)%10), next=text.slice(0,offset)+replacement+text.slice(offset+1);
          pending.push(request(next,{start:offset,end:offset+1,text:replacement}));
        }
        return (await Promise.all(pending)).at(-1);
      },samples);
    }
    await close(); results.push(row);
  }
} finally { await client?.dispose(); }
const report={measuredAt:new Date().toISOString(),mode,node:process.version,cpu:cpus()[0].model,moduleLoadMs,warmup:2,results};
await writeFile(new URL(`comparison-${mode}.json`,directory),JSON.stringify(report,null,2)+'\n');
console.log(mode,'finished');
