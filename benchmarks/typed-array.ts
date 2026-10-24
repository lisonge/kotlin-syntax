import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { once } from 'node:events';
import { outputDirectory } from './output.ts';

// Each worker owns one WASM instance, just as the website does.
if (!isMainThread) {
  const parser = await import(workerData.module);
  const id = parser.openDocument(workerData.source, false);
  let spans: number[] | Int32Array<ArrayBuffer>;
  const read = () => {
    const result = parser[workerData.method](id);
    return typeof result === 'string' ? JSON.parse(result) as number[] : result as Int32Array<ArrayBuffer>;
  };
  spans = read();
  parentPort!.on('message', ({ operation, iteration }: { operation: string; iteration: number }) => {
    const start = performance.now();
    if (operation === 'edit') {
      const offset = workerData.source.lastIndexOf('100000');
      parser.applyDocumentEdit(id, offset, offset + 1, iteration % 2 ? '2' : '3');
    }
    if (operation !== 'transfer') spans = read();
    // A dedicated transferable buffer is required because transfer detaches it.
    const data = operation === 'transfer' && spans instanceof Int32Array ? spans.slice() : spans;
    const workMs = performance.now() - start;
    parentPort!.postMessage({ data, workMs }, data instanceof Int32Array ? [data.buffer] : []);
  });
  parentPort!.postMessage('ready');
} else {
  const directory = await outputDirectory();
  const samples = 100, warmup = 30, rounds = 3;
  const modules = [
    pathToFileURL(resolve(process.env.TYPED_ARRAY_BASELINE_DIR ?? 'build/typed-array-before', 'kotlin-parser.mjs')),
    new URL('../kotlin-parser/dist/kotlin-parser.mjs', import.meta.url),
  ];
  const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
  const sources: [string, string][] = [10, 100].map(size => {
    let source = 'package benchmark\n';
    for (let i = 0; source.length < size * 1024; i++) source += `/** item ${i} */\nclass Box${i}(val value: Int) { fun compute(x: Int) = value + x }\n`;
    return [`${size} KiB`, source];
  });
  sources.push(['parser source', (await readFile(new URL('../kotlin-parser/src/commonMain/kotlin/li/songe/kotlin/parsing/KotlinParser.kt', import.meta.url), 'utf8')).replaceAll('\r\n', '\n')]);
  const results = [];
  for (const [name, text] of sources) {
    const source = text + '\nval benchmarkSentinel = 100000\n';
    for (const operation of ['transfer', 'highlights', 'edit']) {
      const values = [[], []] as { totalMs: number; workMs: number }[][];
      const checksums: string[] = [];
      for (let round = 0; round < rounds; round++) {
        for (const variant of round % 2 ? [1, 0] : [0, 1]) {
          const worker = new Worker(new URL(import.meta.url), { workerData: { module: modules[variant].href, source, method: variant === 0 ? 'documentHighlights' : 'documentClassifications' } });
          try {
            await once(worker, 'message');
            let last: number[] | Int32Array = [];
            for (let i = 0; i < warmup + samples; i++) {
              const reply = once(worker, 'message');
              const start = performance.now();
              worker.postMessage({ operation, iteration: i });
              const [{ data, workMs }] = await reply;
              const totalMs = performance.now() - start;
              last = data;
              if (i >= warmup) values[variant].push({ totalMs, workMs });
            }
            checksums[variant] = hash(JSON.stringify(Array.from(last)));
          } finally { await worker.terminate(); }
        }
        assert.equal(checksums[0], checksums[1], `${name}/${operation}`);
      }
      const stats = values.map(raw => {
        const percentile = (key: 'totalMs' | 'workMs', p: number) => raw.map(v => v[key]).sort((a, b) => a - b)[Math.ceil(raw.length * p) - 1];
        return { p50Ms: percentile('totalMs', .5), p95Ms: percentile('totalMs', .95), workP50Ms: percentile('workMs', .5), raw };
      });
      results.push({ name, operation, sourceHash: hash(source), checksum: checksums[0], before: stats[0], after: stats[1] });
      console.log(name, operation, stats.map(s => `${s.p50Ms.toFixed(3)} / ${s.p95Ms.toFixed(3)} ms`).join(' -> '));
    }
  }
  const report = { date: new Date().toISOString(), node: process.version, cpu: cpus()[0].model, samples, warmup, rounds,
    wasmHashes: await Promise.all(modules.map(async url => hash(await readFile(new URL('kotlin-parser.wasm', url))))), results };
  await writeFile(new URL('typed-array.json', directory), JSON.stringify(report, null, 2) + '\n');
}
