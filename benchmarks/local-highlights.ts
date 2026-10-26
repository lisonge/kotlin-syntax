import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { kotlinFiles } from '../kotlin-vscode/src/workspace-files.ts';

const root = resolve(process.argv[2]);
const files = await kotlinFiles({
  entries: async path => (await readdir(join(root, path), { withFileTypes: true })).map(e => ({ name: e.name, directory: e.isDirectory(), file: e.isFile() })),
  ignoreFile: async path => { try { return await readFile(join(root, path, '.gitignore'), 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; } },
}, () => false);
const corpus = (await Promise.all(files.map(async path => ({ path, source: await readFile(join(root, path), 'utf8') })))).sort((a, b) => a.source.length - b.source.length);
const chosen = new Set(Array.from({ length: 40 }, (_, i) => Math.floor(i * (corpus.length - 1) / 39)));
chosen.add(corpus.findIndex(file => file.path.endsWith('/SubscriptionFailure.kt')));
const cases = [...chosen].filter(i => i >= 0).map(i => corpus[i]);
const beforePath = process.argv[3] ?? 'kotlin-vscode/build/highlight-before/kotlin-parser.mjs';
const reportPath = process.argv[4] ?? 'build/benchmarks/local-highlights.json';
const before = await import(pathToFileURL(resolve(beforePath)).href);
const after = await import(pathToFileURL(resolve('kotlin-vscode/dist/parser/kotlin-parser.mjs')).href);
const samples: Record<string, number[]> = {};
const targetSamples: Record<string, number[]> = {};
let checksum = 0;
for (let round = -5; round < 30; round++) {
  for (const [label, parser] of round % 2 ? [['before', before], ['after', after]] as const : [['after', after], ['before', before]] as const) {
    for (const mode of ['cold', 'edit', 'cached']) {
      let total = 0;
      for (const { path, source } of cases) {
        let id = -1;
        if (mode !== 'cold') { id = parser.openDocument(source, false); parser.documentClassifications(id); }
        const start = performance.now();
        if (mode === 'cold') id = parser.openDocument(source, false);
        if (mode === 'edit') parser.applyDocumentEdit(id, source.length, source.length, '\n// benchmark');
        const data: Int32Array = parser.documentClassifications(id);
        const elapsed = performance.now() - start;
        total += elapsed;
        checksum += data.length;
        parser.closeDocument(id);
        if (round >= 0 && path.endsWith('/SubscriptionFailure.kt')) (targetSamples[label + ':' + mode] ??= []).push(elapsed);
      }
      if (round >= 0) (samples[label + ':' + mode] ??= []).push(total / cases.length);
    }
  }
}
const source = cases.find(c => c.path.endsWith('/SubscriptionFailure.kt'))!.source;
const id = after.openDocument(source, false);
const data: Int32Array = after.documentClassifications(id);
const offset = source.indexOf('SubscriptionFailureReason.RuleInvalidDetail');
const at = (offset: number) => { for (let i = 0; i < data.length; i += 4) if (data[i] === offset) return data[i + 2]; };
assert.equal(at(offset), 16); assert.equal(at(offset + 26), 4);
after.closeDocument(id);
const stats = (samples: Record<string, number[]>) => Object.fromEntries(Object.entries(samples).map(([key, values]) => {
  const s = [...values].sort((a, b) => a - b);
  return [key, { medianMs: (s[14] + s[15]) / 2, p95Ms: s[28] }];
}));
const report = { root, beforePath, node: process.version, files: cases.map(c => ({ path: c.path, units: c.source.length })), stats: stats(samples), subscriptionFailure: stats(targetSamples), samples, targetSamples, checksum,
  scope: '5 warmups, 30 alternating samples; 40 size-stratified GKD files plus SubscriptionFailure. Cold=open+classify, edit=append+classify, cached=classify unchanged. Corpus statistics are per-round mean milliseconds per file. Excludes file IO, Worker transport and UI.' };
await mkdir('build/benchmarks', { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ count: cases.length, stats: report.stats, subscriptionFailure: report.subscriptionFailure, scope: report.scope }, null, 2));
