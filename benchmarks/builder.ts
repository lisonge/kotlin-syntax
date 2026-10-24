import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { outputDirectory } from './output.ts';
const mode=process.argv[2];
const dir=await outputDirectory();
if(!mode) {
  for(const name of ['before','after']) {
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),name],{stdio:'inherit',env:process.env});
    if(await new Promise((accept,reject)=>{child.on('exit',accept);child.on('error',reject);})!==0) throw new Error(name+' failed');
  }
  const before=JSON.parse(await readFile(new URL('builder-before.json',dir),'utf8'));
  const after=JSON.parse(await readFile(new URL('builder-after.json',dir),'utf8'));
  const lines=['# Builder storage optimization','',`Node ${before.node}; ${before.samples} measured samples after 2 warmups, separate processes.`, '',
    '| Input | Parse before ms | Parse after ms | Speedup | Tree JSON after ms | Highlight after ms |', '|---|---:|---:|---:|---:|---:|'];
  before.cases.forEach((a: { sourceHash: string; treeHash: string; highlightHash: string; name: string; parse: { p50: number } }, i: number)=>{
    const b=after.cases[i];
    if(a.sourceHash!==b.sourceHash||a.treeHash!==b.treeHash||a.highlightHash!==b.highlightHash) throw new Error('Differential mismatch: '+a.name);
    lines.push(`| ${a.name} | ${a.parse.p50.toFixed(2)} | ${b.parse.p50.toFixed(2)} | ${(a.parse.p50/b.parse.p50).toFixed(1)}× | ${b.serialize.p50.toFixed(2)} | ${b.highlight.p50.toFixed(2)} |`);
  });
  lines.push('', 'Parse includes lexing and building the immutable tree, but excludes JSON serialization and highlighting. Tree/highlight hashes must match exactly. Lexer timings in JSON include token JSON output, so they are an upper bound on pure lexer cost.', '',
    'The before binary is preserved under build/parser-before; set BUILDER_BASELINE_DIR to another captured baseline directory to reproduce against it. Capture the entire generated WASM module directory before rebuilding. Baseline artifacts and raw CPU profiles are build outputs, not committed dependencies.', '',
    'Only SyntaxBuilder event storage changed: O(1) direct-link append/drop/precede and suffix-proportional rollback replace searches and shifts in a growing array. Trivia binding still uses the same array pass after a single freeze. doneBefore keeps a forward order validation scan; grammar parsing and token logic are unchanged.', '',
    'These are local microbenchmarks, not editor frame timings. GC/OS scheduling affect results; raw samples and binary hashes are included in JSON.');
  await writeFile(new URL('builder-comparison.md',dir),lines.join('\n')+'\n');console.log(lines.join('\n'));process.exit(0);
}
if(!['before','after'].includes(mode)) throw new Error('Unknown mode');
const moduleUrl=mode==='before'?pathToFileURL(resolve(process.env.BUILDER_BASELINE_DIR??'build/parser-before','kotlin-parser.mjs')):new URL('../kotlin-vscode/dist/parser/kotlin-parser.mjs',import.meta.url);
const parser=mode==='before'
  ? await import(moduleUrl.href)
  : await import('../kotlin-vscode/dist/parser/kotlin-parser.mjs');
const classify = mode === 'before' ? parser.documentHighlights : parser.documentClassifications;
const samples=Number(process.env.BUILDER_SAMPLES??10);
if(!Number.isSafeInteger(samples)||samples<1) throw new Error('Invalid sample count');
const hash=(value: string | Uint8Array)=>createHash('sha256').update(value).digest('hex');
function measure(fn: () => unknown) {
  for(let i=0;i<2;i++) fn();
  const values=[];
  for(let i=0;i<samples;i++){const start=performance.now();fn();values.push(performance.now()-start);}
  const sorted=[...values].sort((a,b)=>a-b);
  return {p50:sorted[Math.ceil(samples*.5)-1],p95:sorted[Math.ceil(samples*.95)-1],samples:values};
}
function synthetic(bytes: number){let s='package benchmark\n';for(let i=0;s.length<bytes;i++)s+=`/** item ${i} */\nclass Box${i}(val value: Int) { fun compute(x: Int): Int = value + x }\n`;return s;}
const sources=[10,25,50,100].map(size=>[`${size} KiB`,synthetic(size*1024)]);
sources.push(['parser source',(await readFile(new URL('../kotlin-parser/src/commonMain/kotlin/li/songe/kotlin/parsing/KotlinParser.kt',import.meta.url),'utf8')).replaceAll('\r\n','\n')]);
const cases=[];
for(const [name,source] of sources){
  console.log(mode,name);
  const parse=measure(()=>{const id=parser.openDocument(source,false);parser.closeDocument(id);});
  const id=parser.openDocument(source,false);
  try {
    const serialize=measure(()=>parser.documentTree(id));
    const highlight=measure(()=>classify(id));
    const lexer=measure(()=>parser.tokenize(source));
    const spans = classify(id);
    const normalized = typeof spans === 'string' ? JSON.parse(spans) : Array.from(spans);
    cases.push({name,length:source.length,sourceHash:hash(source),treeHash:hash(parser.documentTree(id)),highlightHash:hash(JSON.stringify(normalized)),parse,serialize,highlight,lexer});
  }finally{parser.closeDocument(id);}
}
const report={mode,node:process.version,measuredAt:new Date().toISOString(),samples,wasmHash:hash(await readFile(new URL('kotlin-parser.wasm',moduleUrl))),cases};
await writeFile(new URL(`builder-${mode}.json`,dir),JSON.stringify(report,null,2)+'\n');
