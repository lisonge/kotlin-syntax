import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { containsName } from '../kotlin-vscode/src/name-filter.ts';

const root = resolve(process.argv[2]);
const excluded = new Set(['.git', '.gradle', '.idea', 'node_modules', 'build', 'dist']);
const paths: string[] = [];
async function walk(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !excluded.has(entry.name)) await walk(join(directory, entry.name));
    else if (entry.isFile() && entry.name.endsWith('.kt')) paths.push(join(directory, entry.name));
  }
}
const readStart = performance.now();
await walk(root);
const sources = await Promise.all(paths.map(path => readFile(path, 'utf8')));
const readMs = performance.now() - readStart;
const names = ['A', 'T', 'id', 'name', 'value', 'App', 'Rule', 'database', 'SubscriptionJson', 'toJson5String', 'RawSubscription', 'DefinitelyMissingSymbol'];
const regex = (name: string) => new RegExp(`(?<![\\p{L}\\p{Nd}_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{Nd}_])`, 'u');
const strategies = {
  includes: (name: string) => (source: string) => source.includes(name),
  regex: (name: string) => { const expression = regex(name); return (source: string) => expression.test(source); },
  indexOf: (name: string) => (source: string) => containsName(source, name),
};
const counts = names.map(name => {
  const re = regex(name);
  for (const source of sources) assert.equal(containsName(source, name), re.test(source), name);
  return { name, includes: sources.filter(s => s.includes(name)).length, bounded: sources.filter(s => containsName(s, name)).length };
});
const timings: Record<string, number[]> = { includes: [], regex: [], indexOf: [] };
let checksum = 0;
const entries = Object.entries(strategies);
for (let round = -10; round < 60; round++) {
  // Rotate order to avoid consistently giving one strategy the first run.
  for (let order = 0; order < entries.length; order++) {
    const [key, prepare] = entries[((round + 12) + order) % entries.length];
    const start = performance.now();
    for (const name of names) {
      const match = prepare(name);
      for (const source of sources) checksum += Number(match(source));
    }
    if (round >= 0) timings[key].push(performance.now() - start);
  }
}
const stats = Object.fromEntries(Object.entries(timings).map(([key, values]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return [key, { medianMs: sorted[30], p95Ms: sorted[56], samples: values.length }];
}));
const report = { root, node: process.version, files: paths.length, utf16Units: sources.reduce((n, s) => n + s.length, 0), readMs, names, counts, stats, timings, checksum,
  scope: 'All nonexcluded kt files, in-memory filtering. 10 warmups and 60 rotated samples; each sample checks all names against all files. Not end-to-end navigation latency.' };
await mkdir('build/benchmarks', { recursive: true });
await writeFile('build/benchmarks/name-filter.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, timings: undefined }, null, 2));
