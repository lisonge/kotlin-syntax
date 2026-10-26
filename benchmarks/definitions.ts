import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { outputDirectory } from './output.ts';
import type { ParserClient } from '../kotlin-vscode/src/parser-client.ts';

const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
type Parser = typeof import('../kotlin-parser/dist/kotlin-parser.mjs');
type Tree = { kind: string; start: number; end: number; children: Tree[]; error: string | null };
type Variant = { name: string; directory: string };
type Input = { name: string; source: string };
type Sample = Record<string, number>;
const stats = (raw: number[]) => {
  const sorted = raw.toSorted((a, b) => a - b);
  return { p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1], raw };
};

if (!isMainThread) {
  const { directory, source, operation } = workerData as {
    directory: string; source: string; operation: string;
  };
  const parser: Parser = await import(pathToFileURL(resolve(directory, 'parser/kotlin-parser.mjs')).href);
  const hasDefinitions = typeof parser.documentDefinitions === 'function';
  let id = parser.openDocument(source, false);
  const tree: Tree = JSON.parse(parser.documentTree(id));
  const identifiers: number[] = [];
  let errors = 0;
  function walk(node: Tree) {
    if (node.error !== null) errors++;
    if (node.kind === 'IDENTIFIER') identifiers.push(node.start);
    node.children.forEach(walk);
  }
  walk(tree);
  assert.equal(errors, 0, 'Benchmark input must parse without errors');
  const highlightsChecksum = hash(new Uint8Array(parser.documentClassifications(id).buffer));
  const positive: number[] = [];
  const definitionsHash = createHash('sha256');
  function verifyDefinitions() {
    for (const offset of identifiers) {
      const data = parser.documentDefinitions(id, offset);
      definitionsHash.update(JSON.stringify([offset, ...data]));
      if (data.length) positive.push(offset);
    }
    assert.ok(positive.length > 0);
  }
  const needsDefinitions = operation === 'index' || operation.includes('definition');
  if (hasDefinitions && needsDefinitions) verifyDefinitions();
  const queryOffsets = Array.from({ length: Math.min(32, positive.length) }, (_, i) => positive[Math.floor(i * positive.length / Math.min(32, positive.length))]);
  const tail = source.lastIndexOf('100000');
  const front = source.indexOf('package ') + 'package '.length;
  const raw: Sample[] = [];
  const digest = createHash('sha256');
  let client: ParserClient | undefined;
  if (operation.startsWith('worker-')) {
    parser.closeDocument(id);
    client = new (await import(pathToFileURL(resolve(directory, 'parser-client.js')).href)).ParserClient();
    await client!.request({ key: 'benchmark', version: 1, source, script: false });
  }
  let current = source, version = 1;
  let iteration = 0;
  parentPort!.on('message', async (message: { kind: 'step' | 'finish'; measured?: boolean }) => {
    if (message.kind === 'step') {
      let sample: Sample;
      let output: Int32Array | Uint32Array;
      const replacement = operation === 'worker-front' ? (iteration % 2 ? 'x' : 'y') : (iteration % 2 ? '2' : '3');
      if (operation === 'parse-highlights') {
        parser.closeDocument(id);
        const start = performance.now();
        id = parser.openDocument(source, false);
        const parsed = performance.now();
        output = parser.documentClassifications(id);
        const end = performance.now();
        sample = { parseMs: parsed - start, highlightsMs: end - parsed, totalMs: end - start };
      } else if (operation === 'index') {
        const start = performance.now();
        parser.applyDocumentEdit(id, tail, tail + 1, replacement);
        const edited = performance.now();
        output = parser.documentDefinitions(id, queryOffsets[iteration % queryOffsets.length]);
        const indexed = performance.now();
        // Rotate through known bound references, so this measures actual scope lookup.
        const cachedStart = performance.now();
        for (const offset of queryOffsets) parser.documentDefinitions(id, offset);
        const end = performance.now();
        sample = { editMs: edited - start, indexMs: indexed - edited, cachedQueryUs: (end - cachedStart) * 1000 / queryOffsets.length };
      } else {
        const offset = operation === 'worker-front' ? front : tail;
        const start = performance.now();
        if (operation !== 'worker-cached-definition') {
          current = current.slice(0, offset) + replacement + current.slice(offset + 1);
          client!.change('benchmark', ++version, [{ start: offset, end: offset + 1, text: replacement }]);
        }
        const snapshot = { key: 'benchmark', version, source: current, script: false };
        if (operation === 'worker-cached-definition') {
          output = (await client!.definitions(snapshot, queryOffsets[iteration % queryOffsets.length]))!;
        } else if (operation === 'worker-definition-highlights') {
          const definition = client!.definitions(snapshot, queryOffsets[iteration % queryOffsets.length]);
          const highlighting = client!.request(snapshot);
          const [target, tokens] = await Promise.all([definition, highlighting]);
          assert.ok(target && tokens);
          output = tokens;
        } else output = (await client!.request(snapshot))!;
        sample = { totalMs: performance.now() - start };
      }
      assert.ok(output);
      if (message.measured) {
        raw.push(sample);
        digest.update(new Uint8Array(output.buffer, output.byteOffset, output.byteLength));
      }
      iteration++;
      parentPort!.postMessage('step');
      return;
    }
    const measures = Object.fromEntries(Object.keys(raw[0]).map(key => [key, stats(raw.map(sample => sample[key]))]));
    // Keep the no-navigation controls free of definition-index work until timing has ended.
    if (hasDefinitions && !needsDefinitions) {
      if (client) id = parser.openDocument(source, false);
      verifyDefinitions();
      if (client) parser.closeDocument(id);
    }
    const verification = { identifiers: identifiers.length, resolved: positive.length, highlightsChecksum,
      definitionsChecksum: hasDefinitions ? definitionsHash.digest('hex') : null };
    if (client) await client.dispose(); else parser.closeDocument(id);
    parentPort!.postMessage({ verification, checksum: digest.digest('hex'), measures });
    parentPort!.close();
  });
  parentPort!.postMessage('ready');
} else {
  const directory = await outputDirectory();
  const samples = Number(process.env.DEFINITION_SAMPLES ?? 100);
  const warmup = Number(process.env.DEFINITION_WARMUP ?? 30);
  const rounds = Number(process.env.DEFINITION_ROUNDS ?? 3);
  assert.ok([samples, rounds].every(n => Number.isInteger(n) && n > 0));
  assert.ok(Number.isInteger(warmup) && warmup >= 0);
  const variants: Variant[] = JSON.parse(process.env.DEFINITION_VARIANTS ?? JSON.stringify([
    { name: 'original', directory: 'build/definition-performance/original-source/kotlin-vscode/dist' },
    { name: 'before', directory: 'build/definition-performance/before' },
    { name: 'after', directory: 'kotlin-vscode/dist' },
  ]));
  const inputs: Input[] = [10, 100].map(size => {
    let source = 'package benchmark\nimport example.External as Imported\n';
    for (let i = 0; source.length < size * 1024; i++) source += `class Box${i}(val value: Int) { fun compute(p: Int): Int { val x = p + value; return x + p } }\n`;
    return { name: `${size}KiB`, source };
  });
  inputs.push({ name: 'parser-source', source: (await readFile(new URL('../kotlin-parser/src/commonMain/kotlin/li/songe/kotlin/parsing/KotlinParser.kt', import.meta.url), 'utf8')).replaceAll('\r\n', '\n') });
  inputs.push({ name: 'nested-32', source: 'package benchmark\nfun nested(p: Int) {\n' + 'if (p > 0) {\n'.repeat(32) + 'println(p + p)\n'.repeat(640) + '}\n'.repeat(33) });
  for (const input of inputs) {
    // Two small declarations keep suffix reparsing independent of index rebuilding.
    input.source += '\nval benchmarkPaddingA = 0\nval benchmarkPaddingB = 0\nval benchmarkSentinel = 100000\n';
  }
  const operationFilter = process.env.DEFINITION_OPERATIONS?.split(',');
  const inputFilter = process.env.DEFINITION_INPUTS?.split(',');
  const operations = operationFilter ?? ['parse-highlights', 'index', 'worker-tail', 'worker-front', 'worker-cached-definition', 'worker-definition-highlights'];
  type Result = { input: string; utf16Length: number; sourceHash: string; variant: string; operation: string; round: number;
    verification: { identifiers: number; resolved: number; highlightsChecksum: string; definitionsChecksum: string | null };
    checksum: string; measures: Record<string, ReturnType<typeof stats>> };
  const results: Result[] = [];
  const binaryHashes = await Promise.all(variants.map(async variant => {
    const binary = await readFile(resolve(variant.directory, 'parser/kotlin-parser.wasm'));
    return { ...variant, sha256: hash(binary), bytes: binary.length, gzipBytes: gzipSync(binary).length,
      clientHash: hash(await readFile(resolve(variant.directory, 'parser-client.js'))) };
  }));
  for (const input of inputs.filter(input => !inputFilter || inputFilter.includes(input.name))) {
    for (const operation of operations) {
      // Large-file full parsing is already covered by the direct phase benchmark.
      if (!operationFilter && operation === 'worker-front' && input.name !== '10KiB') continue;
      const navigation = operation === 'index' || operation.includes('definition');
      const selected = variants.filter(variant => navigation ? variant.name !== 'original' :
        !(variants.some(item => item.name === 'original') && variant.name === 'before'));
      for (let round = 0; round < rounds; round++) {
        const sessions: { variant: Variant; worker: Worker }[] = [];
        const request = async (worker: Worker, kind: 'step' | 'finish', measured = false) => {
          const reply = once(worker, 'message');
          worker.postMessage({ kind, measured });
          return (await reply)[0];
        };
        try {
          for (const variant of selected) {
            const worker = new Worker(new URL(import.meta.url), { workerData: { ...variant, source: input.source, operation } });
            sessions.push({ variant, worker });
            assert.equal((await once(worker, 'message'))[0], 'ready');
          }
          for (let iteration = 0; iteration < warmup + samples; iteration++) {
            // Only one variant works at a time; rotate after every individual sample.
            const first = (round + iteration) % sessions.length;
            for (let slot = 0; slot < sessions.length; slot++) {
              await request(sessions[(first + slot) % sessions.length].worker, 'step', iteration >= warmup);
            }
            if (iteration === warmup + Math.floor(samples / 2)) console.log(input.name, operation, `round=${round + 1}`, 'halfway');
          }
          for (const { variant, worker } of sessions) {
            const result = await request(worker, 'finish');
            results.push({ input: input.name, utf16Length: input.source.length, sourceHash: hash(input.source), variant: variant.name, operation, round, ...result });
            console.log(input.name, operation, variant.name, `round=${round + 1}`, Object.entries(result.measures as Record<string, { p50: number; p95: number }>).map(([key, value]) => `${key}=${value.p50.toFixed(3)}/${value.p95.toFixed(3)}`).join(' '));
            await writeFile(new URL('definitions-progress.json', directory), JSON.stringify(results, null, 2) + '\n');
          }
        } finally { for (const { worker } of sessions) await worker.terminate(); }
      }
    }
  }
  // All queried identifier destinations, not just the timed queries, must agree.
  for (const input of inputs) {
    const rows = results.filter(row => row.input === input.name);
    assert.ok(new Set(rows.map(row => row.verification.highlightsChecksum)).size <= 1, input.name + ' classifications');
    assert.ok(new Set(rows.map(row => row.verification.definitionsChecksum).filter(Boolean)).size <= 1, input.name + ' definitions');
    for (const operation of operations) {
      assert.ok(new Set(rows.filter(row => row.operation === operation).map(row => row.checksum)).size <= 1, input.name + '/' + operation + ' measured outputs');
    }
  }
  const grouped = [...new Set(results.map(row => `${row.input}/${row.operation}/${row.variant}`))].map(key => {
    const rows = results.filter(row => `${row.input}/${row.operation}/${row.variant}` === key);
    return { input: rows[0].input, operation: rows[0].operation, variant: rows[0].variant,
      measures: Object.fromEntries(Object.keys(rows[0].measures).map(metric => [metric, stats(rows.flatMap(row => row.measures[metric].raw))])) };
  });
  const paired = grouped.filter(row => row.variant === 'after').flatMap(row => {
    const baseline = row.operation === 'index' || row.operation.includes('definition') ? 'before' : 'original';
    const before = results.filter(item => item.input === row.input && item.operation === row.operation && item.variant === baseline);
    const after = results.filter(item => item.input === row.input && item.operation === row.operation && item.variant === 'after');
    if (!before.length) return [];
    return Object.keys(row.measures).map(metric => ({ input: row.input, operation: row.operation, baseline, metric,
      ratio: stats(after.flatMap(item => item.measures[metric].raw.map((value, index) => value / before.find(old => old.round === item.round)!.measures[metric].raw[index]))) }));
  });
  const report = { measuredAt: new Date().toISOString(), node: process.version, cpu: cpus()[0].model, samples, warmup, rounds, binaryHashes,
    notes: [
      'Each variant/case uses a fresh Worker per round. Default: 30 warmups and 100 measured samples per round, three rounds. Variants execute one at a time and alternate order after every individual sample; paired ratios compare neighboring measurements.',
      'Controls compare pre-navigation original with optimized after; navigation compares unoptimized before with optimized after. Front-edit Worker tests default to 10 KiB because direct parsing already covers larger inputs.',
      'Direct phases use production WASM. Index timing follows a suffix edit; cached queries rotate across up to 32 known bound references and report microseconds per query.',
      'Worker timings use the real ParserClient and parser Worker, including versioned edits, scheduling and transport. They exclude VS Code document.getText(), provider work, rendering and cold startup.',
      'The worker-definition-highlights case queues a definition query before a highlighting request after each tail edit; total is time until both complete.',
      'Inputs append two small declarations before the edited sentinel to isolate suffix parsing from whole-file index rebuilding. Front edits force full reparsing.',
      'Verification compares every identifier destination and classifications across binaries outside timed regions. Raw samples and per-round statistics are retained.',
      'No retained-memory measurement is claimed. OS scheduling, WASM GC and thermal/power conditions affect timings. Low-sample runs are smoke checks only.',
    ], grouped, paired, results };
  await writeFile(new URL('definitions.json', directory), JSON.stringify(report, null, 2) + '\n');
  const lines = ['# Definition navigation benchmark', '', `${report.node}; ${report.cpu}`, '', ...report.notes.map(note => '- ' + note), '',
    '| Input | Operation | Variant | Metric | P50 | P95 |', '|---|---|---|---|---:|---:|'];
  for (const row of grouped) for (const [metric, values] of Object.entries(row.measures)) {
    lines.push(`| ${row.input} | ${row.operation} | ${row.variant} | ${metric} | ${values.p50.toFixed(4)} | ${values.p95.toFixed(4)} |`);
  }
  await writeFile(new URL('definitions.md', directory), lines.join('\n') + '\n');
}
