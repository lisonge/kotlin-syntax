import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputDirectory } from './output.ts';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const rounds = 3;
const samplesPerRound = Number(process.env.FORMAT_CLI_SAMPLES ?? 10);
const warmups = Number(process.env.FORMAT_CLI_WARMUP ?? 3);
assert.ok(Number.isInteger(samplesPerRound) && samplesPerRound > 0);
assert.ok(Number.isInteger(warmups) && warmups >= 0);
const output = await outputDirectory();
const work = await mkdtemp(fileURLToPath(new URL('format-cli-', output)));
const dist = new URL('../kotlin-format/dist/', import.meta.url);
await cp(dist, join(work, 'dist'), { recursive: true });
const pkgSource = await readFile(new URL('../kotlin-format/package.json', import.meta.url), 'utf8');
await writeFile(join(work, 'package.json'), pkgSource);
const original = await readFile(new URL('cli.mjs', dist), 'utf8');
const importLine = 'const { formatWithOptions } = await (formatter ??= import("./kotlin-format.mjs"));';
const callLine = 'return formatWithOptions(source, o.maxWidth, o.blockIndent, o.continuationIndent, o.trailingCommas, o.removeUnusedImports, o.preserveLambdaBreaks, file.endsWith(".kts"));';
function replaceOnce(source: string, from: string, to: string): string {
  assert.equal(source.split(from).length, 2, `Built CLI changed: ${from}`);
  return source.replace(from, to);
}
let instrumented = replaceOnce(original, 'async function main() {', `
const phase = { wasmMs: 0, formatMs: 0, firstFormatMs: 0, calls: 0, mainMs: 0 };
let mainStart;
process.once('beforeExit', () => {
  phase.mainMs = performance.now() - mainStart;
  process.stderr.write(JSON.stringify(phase));
});
async function main() {
mainStart = performance.now();`);
instrumented = replaceOnce(instrumented, importLine, `const importStart = performance.now();
${importLine}
phase.wasmMs += performance.now() - importStart;`);
instrumented = replaceOnce(instrumented, callLine, `const formatStart = performance.now();
const output = ${callLine.slice('return '.length)}
const elapsed = performance.now() - formatStart;
if (phase.calls === 0) phase.firstFormatMs = elapsed;
phase.formatMs += elapsed;
phase.calls++;
return output;`);
await writeFile(join(work, 'dist', 'profile.mjs'), instrumented);
const { formatCode } = await import('../kotlin-format/dist/kotlin-format.mjs');
const small = 'package example\n\n' + Array.from({ length: 12 }, (_, i) =>
  `fun calculate${i}(values:List<Int>):Int{val selected=values.filter{it>${i}};return selected.sum()}\n`).join('');
const largePath = 'kotlin-parser/src/commonMain/kotlin/li/songe/kotlin/parsing/KotlinParser.kt';
const large = await readFile(new URL(`../${largePath}`, import.meta.url), 'utf8');
function stable(source: string): string {
  for (let i = 0; i < 10; i++) {
    const next = formatCode(source, 'KOTLINLANG', 100, false);
    if (next === source) return source;
    source = next;
  }
  throw new Error('Fixture did not converge');
}
type Phase = { wasmMs: number; formatMs: number; firstFormatMs: number; calls: number; mainMs: number };
type Sample = { round: number; totalMs: number; phase?: Phase; startupAndExitMs?: number; otherCliMs?: number };
const variants = ['plain', 'plain-hit', 'profile', 'profile-cold', 'profile-hit', 'profile-one-miss', 'profile-dirty'] as const;
type Variant = typeof variants[number];
function summary(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  return { mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1] };
}
const rows: unknown[] = [];
const startup: number[] = [];
for (let i = -warmups; i < rounds * samplesPerRound; i++) {
  const start = performance.now();
  const result = spawnSync(process.execPath, ['-e', ''], { windowsHide: true, encoding: 'utf8' });
  const elapsed = performance.now() - start;
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  if (i >= 0) startup.push(elapsed);
}
for (const spec of [
  { name: '1-small', count: 1, raw: small },
  { name: '10-small', count: 10, raw: small },
  { name: '50-small', count: 50, raw: small },
  { name: '1-real-large', count: 1, raw: large },
]) {
  if (process.env.FORMAT_CLI_CASES && !process.env.FORMAT_CLI_CASES.split(',').includes(spec.name)) continue;
  const cwd = join(work, spec.name);
  await mkdir(cwd);
  await writeFile(join(cwd, 'package.json'), '{}');
  await writeFile(join(cwd, 'kotlin-format.json'), '{"style":"KOTLINLANG"}');
  const source = stable(spec.raw);
  const dirtyExpected = formatCode(spec.raw, 'KOTLINLANG', 100, false);
  const changed = source.replace('package ', `// Newly staged change${source.includes('\r\n') ? '\r\n' : '\n'}package `);
  assert.notEqual(changed, source);
  assert.equal(formatCode(changed, 'KOTLINLANG', 100, false), changed);
  const files = Array.from({ length: spec.count }, (_, i) => join(cwd, `File${String(i).padStart(3, '0')}.kt`));
  const cache = join(cwd, 'cache.json');
  for (const file of files) await writeFile(file, source);
  const seed = spawnSync(process.execPath, [join(work, 'dist', 'cli.mjs'), '--write', '--cache', '--cache-location', cache, ...files],
    { cwd, windowsHide: true, encoding: 'utf8' });
  assert.ifError(seed.error);
  assert.equal(seed.status, 0, seed.stderr);
  const cacheSeed = await readFile(cache, 'utf8');
  const data = Object.fromEntries(variants.map(v => [v, [] as Sample[]])) as Record<Variant, Sample[]>;
  async function measure(variant: Variant, round: number, record: boolean) {
    const dirty = variant === 'profile-dirty';
    const oneMiss = variant === 'profile-one-miss';
    const cached = variant !== 'plain' && variant !== 'profile';
    const profiled = variant.startsWith('profile');
    for (const [i, file] of files.entries()) await writeFile(file, dirty ? spec.raw : oneMiss && i === 0 ? changed : source);
    if (variant === 'profile-cold' || dirty) await rm(cache, { force: true });
    else await writeFile(cache, cacheSeed);
    const args = ['--write', ...(cached ? ['--cache', '--cache-location', cache] : []), ...files];
    const start = performance.now();
    const result = spawnSync(process.execPath, [join(work, 'dist', profiled ? 'profile.mjs' : 'cli.mjs'), ...args],
      { cwd, windowsHide: true, encoding: 'utf8' });
    const totalMs = performance.now() - start;
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, dirty && spec.raw !== dirtyExpected ? files.map(f => `${f}\n`).join('') : '');
    for (const [i, file] of files.entries()) assert.equal(await readFile(file, 'utf8'), dirty ? dirtyExpected : oneMiss && i === 0 ? changed : source);
    const sample: Sample = { round, totalMs };
    if (profiled) {
      const phase = JSON.parse(result.stderr) as Phase;
      const expectedCalls = variant === 'profile-hit' ? 0 : oneMiss ? 1 : spec.count;
      assert.equal(phase.calls, expectedCalls);
      sample.phase = phase;
      sample.startupAndExitMs = totalMs - phase.mainMs;
      sample.otherCliMs = phase.mainMs - phase.wasmMs - phase.formatMs;
    } else assert.equal(result.stderr, '');
    if (record) data[variant].push(sample);
  }
  for (let i = 0; i < warmups; i++) for (const variant of variants) await measure(variant, -1, false);
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < samplesPerRound; i++) {
      const offset = (round * samplesPerRound + i) % variants.length;
      const order = [...variants.slice(offset), ...variants.slice(0, offset)];
      if (i % 2) order.reverse();
      for (const variant of order) await measure(variant, round, true);
    }
    console.log(`${spec.name}: round ${round + 1}/${rounds}`);
  }
  const summaries = Object.fromEntries(variants.map(variant => {
    const samples = data[variant];
    return [variant, { total: summary(samples.map(s => s.totalMs)), ...(variant.startsWith('profile') ? {
      startupAndExit: summary(samples.map(s => s.startupAndExitMs!)),
      wasm: summary(samples.map(s => s.phase!.wasmMs)),
      format: summary(samples.map(s => s.phase!.formatMs)),
      firstFormat: summary(samples.map(s => s.phase!.firstFormatMs)),
      otherCli: summary(samples.map(s => s.otherCliMs!)),
    } : {}) }];
  }));
  rows.push({ name: spec.name, count: spec.count, bytesPerFile: Buffer.byteLength(source), rawBytesPerFile: Buffer.byteLength(spec.raw),
    sourceHash: hash(source), rawHash: hash(spec.raw), summaries, samples: data });
  console.log(JSON.stringify({ name: spec.name, totalMs: Object.fromEntries(variants.map(v => [v, summaries[v].total])) }));
}
const result = {
  measuredAt: new Date().toISOString(), version: JSON.parse(pkgSource).version,
  node: process.version, platform: platform(), os: release(), cpu: cpus()[0]?.model,
  git: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout.trim(),
  rounds, samplesPerRound, warmups, fixtureDirectory: work,
  cliHash: hash(original), wasmHash: hash(await readFile(new URL('kotlin-format.wasm', dist))),
  largeSource: largePath, startup: { summary: summary(startup), samples: startup }, rows,
  methodology: [
    'Every sample launches a fresh Node process, direct argv file list, sequential execution; variant order rotates and reverses.',
    'Wall time includes spawn through process exit. Excludes Git, hooks, lint-staged, package-manager launchers and fixture/cache reset.',
    'OS filesystem cache is warm; warmups do not reuse a Node process or WASM instance.',
    'Profiled copy measures dynamic WASM module import (read/compile/instantiate/runtime initialization), synchronous formatting calls and remaining CLI work.',
    'StartupAndExit is wall time minus main duration: process/bootstrap, static module evaluation, profiling output and exit; not pure Node startup.',
    'First format call includes lazy runtime setup and JIT effects. OtherCli includes argument parsing, file/ignore/config I/O, hashing and cache writes.',
    'Plain and plain-hit use the unmodified production CLI as instrumentation controls.',
    'Cold cache means absent result-cache file, not cold OS disk cache. Dirty writes start from original source and use one formatting pass.',
    'Small files use the same synthetic body at distinct paths. Large case uses repository KotlinParser.kt. All outputs and profiled formatter call counts are verified.',
  ],
};
const destination = new URL('format-cli.json', output);
await writeFile(destination, JSON.stringify(result, null, 2));
console.log(`Report: ${fileURLToPath(destination)}`);
