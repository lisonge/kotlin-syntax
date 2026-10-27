import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { outputDirectory } from './output.ts';

// FORMAT_IO_VARIANTS is a JSON array of {name, directory}; directory contains package.json and dist/.
const variants: { name: string; directory: string }[] = JSON.parse(process.env.FORMAT_IO_VARIANTS ??
  JSON.stringify([{ name: 'before', directory: 'build/benchmarks/format-io-before' }]));
const rounds = 3;
const perRound = Number(process.env.FORMAT_IO_SAMPLES ?? 10);
const warmups = Number(process.env.FORMAT_IO_WARMUP ?? 2);
assert.ok(Number.isInteger(perRound) && perRound > 0);
assert.ok(Number.isInteger(warmups) && warmups >= 0);
const output = await outputDirectory();
const work = await mkdtemp(fileURLToPath(new URL('format-io-', output)));
const preload = join(work, 'profile.mjs');
await writeFile(preload, `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const metrics = {};
function category(op, input) {
  const path = input instanceof URL ? fileURLToPath(input) : String(input);
  const name = basename(path);
  if (op === 'stat') {
    if (name === '.git' || name === 'package.json') return 'rootStat';
    if (name.startsWith('kotlin-format.')) return 'configStat';
    if (name === '.gitignore') return 'ignoreStat';
    return 'inputStat';
  }
  if (op === 'lstat' || op === 'readdir') return 'scan';
  if (op === 'readFile') {
    if (name.startsWith('kotlin-format.') && extname(path) !== '.wasm') return 'configRead';
    if (['.kt', '.kts'].includes(extname(path))) return 'sourceRead';
    if (name === 'cache.json') return 'cacheRead';
    if (name === '.gitignore') return 'ignoreRead';
    return 'otherRead';
  }
  return name === 'cache.json' || op === 'mkdir' ? 'cacheWrite' : 'sourceWrite';
}
for (const op of ['stat', 'lstat', 'readdir', 'readFile', 'writeFile', 'mkdir']) {
  const original = fs[op];
  fs[op] = async function(...args) {
    const key = category(op, args[0]);
    const metric = metrics[key] ??= { count: 0, ms: 0, paths: {} };
    const path = String(args[0]);
    metric.count++;
    metric.paths[path] = (metric.paths[path] ?? 0) + 1;
    const start = performance.now();
    try { return await original.apply(this, args); }
    finally { metric.ms += performance.now() - start; }
  };
}
syncBuiltinESMExports();
process.once('beforeExit', () => {
  for (const value of Object.values(metrics)) {
    value.uniquePaths = Object.keys(value.paths).length;
    delete value.paths;
  }
  process.stderr.write(JSON.stringify(metrics));
});
`);
const { formatCode } = await import('../kotlin-format/dist/kotlin-format.mjs');
const raw = 'package example\n\n' + Array.from({ length: 12 }, (_, i) =>
  `fun calculate${i}(values:List<Int>):Int{val selected=values.filter{it>${i}};return selected.sum()}\n`).join('');
const sources = { KOTLINLANG: formatCode(raw, 'KOTLINLANG', 100, false), GOOGLE: formatCode(raw, 'GOOGLE', 100, false) };
for (const style of ['KOTLINLANG', 'GOOGLE'] as const) assert.equal(formatCode(sources[style], style, 100, false), sources[style]);
type Metric = { count: number; ms: number; uniquePaths: number };
type Sample = { totalMs: number; round: number; metrics?: Record<string, Metric> };
function stats(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  return { mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1] };
}
const rows: unknown[] = [];
for (const spec of [
  { name: 'flat-1-hit', count: 1, nested: false, cache: true },
  { name: 'flat-10-hit', count: 10, nested: false, cache: true },
  { name: 'flat-50-hit', count: 50, nested: false, cache: true },
  { name: 'nested-50-hit', count: 50, nested: true, cache: true },
  { name: 'flat-50-no-cache', count: 50, nested: false, cache: false },
]) {
  if (process.env.FORMAT_IO_CASES && !process.env.FORMAT_IO_CASES.split(',').includes(spec.name)) continue;
  const cwd = join(work, spec.name);
  await mkdir(cwd);
  await writeFile(join(cwd, 'package.json'), '{}');
  await writeFile(join(cwd, 'kotlin-format.json'), '{"style":"KOTLINLANG"}');
  await writeFile(join(cwd, '.gitignore'), '# benchmark\n');
  const files: string[] = [];
  const expected: string[] = [];
  for (let i = 0; i < spec.count; i++) {
    const module = Math.floor(i / 5);
    const directory = spec.nested ? join(cwd, `module-${module}`, 'src', 'main', 'kotlin') : cwd;
    await mkdir(directory, { recursive: true });
    const google = spec.nested && module % 2 === 1;
    if (google) await writeFile(join(cwd, `module-${module}`, 'kotlin-format.json'), '{"style":"GOOGLE"}');
    const file = join(directory, `File${String(i).padStart(3, '0')}.kt`);
    const source = sources[google ? 'GOOGLE' : 'KOTLINLANG'];
    await writeFile(file, source);
    files.push(file);
    expected.push(source);
  }
  const cachePath = join(cwd, 'cache.json');
  const args = ['--write', ...(spec.cache ? ['--cache', '--cache-location', cachePath] : []), ...files];
  const seed = spawnSync(process.execPath, [resolve(variants[0].directory, 'dist/cli.mjs'), '--write', '--cache', '--cache-location', cachePath, ...files],
    { cwd, encoding: 'utf8', windowsHide: true });
  assert.ifError(seed.error);
  assert.equal(seed.status, 0, seed.stderr);
  const cacheSeed = await readFile(cachePath, 'utf8');
  const combinations = variants.flatMap(v => [false, true].map(profile => ({ ...v, profile, key: `${v.name}-${profile ? 'profile' : 'plain'}` })));
  const samples: Record<string, Sample[]> = Object.fromEntries(combinations.map(c => [c.key, []]));
  for (let n = -warmups; n < rounds * perRound; n++) {
    const offset = Math.max(n, 0) % combinations.length;
    const order = [...combinations.slice(offset), ...combinations.slice(0, offset)];
    if (n % 2) order.reverse();
    for (const c of order) {
      await writeFile(cachePath, cacheSeed);
      const start = performance.now();
      const result = spawnSync(process.execPath, [...(c.profile ? ['--import', pathToFileURL(preload).href] : []), resolve(c.directory, 'dist/cli.mjs'), ...args],
        { cwd, encoding: 'utf8', windowsHide: true });
      const totalMs = performance.now() - start;
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      if (!c.profile) assert.equal(result.stderr, '');
      for (const [i, file] of files.entries()) assert.equal(await readFile(file, 'utf8'), expected[i]);
      if (spec.cache) assert.deepEqual(JSON.parse(await readFile(cachePath, 'utf8')), JSON.parse(cacheSeed));
      if (n >= 0) samples[c.key].push({ totalMs, round: Math.floor(n / perRound), ...(c.profile ? { metrics: JSON.parse(result.stderr) } : {}) });
    }
    if (n >= 0 && (n + 1) % perRound === 0) console.log(`${spec.name}: round ${(n + 1) / perRound}/${rounds}`);
  }
  const summaries = Object.fromEntries(combinations.map(c => {
    const data = samples[c.key];
    const keys = [...new Set(data.flatMap(s => Object.keys(s.metrics ?? {})))];
    return [c.key, { total: stats(data.map(s => s.totalMs)), metrics: Object.fromEntries(keys.map(key => [key, {
      ms: stats(data.map(s => s.metrics?.[key]?.ms ?? 0)),
      count: stats(data.map(s => s.metrics?.[key]?.count ?? 0)),
      uniquePaths: stats(data.map(s => s.metrics?.[key]?.uniquePaths ?? 0)),
    }])) }];
  }));
  rows.push({ ...spec, summaries, samples });
  console.log(JSON.stringify({ name: spec.name, total: Object.fromEntries(Object.entries(summaries).map(([key, value]) => [key, value.total])) }));
}
const hashes = await Promise.all(variants.map(async v => ({ ...v, cliHash: createHash('sha256').update(await readFile(resolve(v.directory, 'dist/cli.mjs'))).digest('hex') })));
await writeFile(new URL('format-cli-io.json', output), JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version,
  cpu: cpus()[0]?.model, platform: platform(), rounds, perRound, warmups, variants: hashes, fixtureDirectory: work, rows,
  methodology: 'Fresh processes with alternating variants. Profile preload wraps fs/promises; times are exclusive per I/O call, include failed existence probes, and exclude wrapper bookkeeping. Plain processes have no preload. Warm OS filesystem cache. Source outputs and cache contents verified after every invocation. No Git/hook/package-manager overhead.',
}, null, 2));
console.log(`Report: ${fileURLToPath(new URL('format-cli-io.json', output))}`);
