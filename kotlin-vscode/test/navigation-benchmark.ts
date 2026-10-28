import type * as VSCode from 'vscode';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import assert from 'node:assert/strict';
import type { ParserClient } from '../src/parser-client.ts';
import type { WorkspaceDefinitions } from '../src/workspace-definitions.ts';
const vscode: typeof VSCode = createRequire(import.meta.url)('vscode');
const project = resolve(import.meta.dirname, '../..');
type Counts = { directories: number; files: number; summaries: number };
type Sample = { variant: string; case: string; round: number; ms: number } & Counts;
const empty = (): Counts => ({ directories: 0, files: 0, summaries: 0 });
const percentile = (items: number[], p: number) => [...items].sort((a, b) => a - b)[Math.ceil(items.length * p) - 1];

/** Run via scripts/test-host.ts with VSCODE_TEST_ENTRY=test/navigation-benchmark.ts and an isolated workspace. */
export async function run() {
  const root = process.env.VSCODE_TEST_WORKSPACE!;
  assert.ok(root && root !== '1');
  const warmups = Number(process.env.NAVIGATION_WARMUPS ?? 20);
  const samples = Number(process.env.NAVIGATION_SAMPLES ?? 40);
  const rounds = Number(process.env.NAVIGATION_ROUNDS ?? 3);
  assert.ok([samples, rounds].every(n => Number.isInteger(n) && n > 0));
  assert.ok(Number.isInteger(warmups) && warmups >= 0);
  const before = resolve(project, process.env.NAVIGATION_BEFORE ?? 'build/navigation-refactor-before');
  const output = resolve(project, process.env.BENCH_OUTPUT_DIR ?? 'build/benchmarks/navigation-refactor');
  await mkdir(output, { recursive: true });
  const fixtures: { name: string; document: VSCode.TextDocument; offset: number; target: string }[] = [];
  const inputs: { path: string; hash: string; bytes: number }[] = [];
  async function write(path: string, source: string) {
    const uri = vscode.Uri.file(resolve(root, path));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(source));
    inputs.push({ path, hash: createHash('sha256').update(source).digest('hex'), bytes: Buffer.byteLength(source) });
    return uri;
  }
  for (const count of [24, 96]) {
    const pkg = `bench${count}`, base = `module${count}/src`;
    for (let i = 0; i < count; i++) await write(`${base}/commonMain/kotlin/models/Model${i}.kt`,
      `package ${pkg}\nclass Model${i}(val name: String, val count: Int, val items: List<String>)\n`);
    const common = await write(`${base}/commonMain/kotlin/Common.kt`, `package ${pkg}\nexpect fun sync(name: String, count: Int, items: List<String>)`);
    const platform = await write(`${base}/jvmMain/kotlin/Platform.kt`, `package ${pkg}\nactual fun sync(name: kotlin.String, count: kotlin.Int, items: kotlin.collections.List<kotlin.String>) {}`);
    const document = await vscode.workspace.openTextDocument(common);
    await vscode.workspace.openTextDocument(platform);
    fixtures.push({ name: `counterpart-${count}`, document, offset: document.getText().indexOf('expect'), target: platform.toString() });
  }
  const model = await write('ordinary/Model.kt', 'package ordinary\nclass Value { fun work() {} }\nclass Box { val value: Value? = null }');
  const caller = await write('ordinary/Caller.kt', 'package ordinary\nfun use(box: Box) { box.value?.work() }');
  const document = await vscode.workspace.openTextDocument(caller);
  await vscode.workspace.openTextDocument(model);
  fixtures.push({ name: 'member-chain', document, offset: document.getText().lastIndexOf('work'), target: model.toString() });
  const definitions = [
    { name: 'before', source: resolve(before, 'src'), dist: resolve(before, 'dist') },
    { name: 'after', source: resolve(project, 'kotlin-vscode/src'), dist: resolve(project, 'kotlin-vscode/dist') },
  ];
  const sourceHashes = await Promise.all(definitions.map(async v => ({ variant: v.name, directory: v.source,
    files: await Promise.all((await readdir(v.source)).filter(name => name.endsWith('.ts')).sort().map(async name => ({
      name, hash: createHash('sha256').update(await readFile(resolve(v.source, name))).digest('hex'),
    }))),
  })));
  const raw: Sample[] = [];
  const cancellation = new vscode.CancellationTokenSource();
  const controller = new AbortController();
  for (let round = 0; round < rounds; round++) {
    const variants: { name: string; client: ParserClient; provider: WorkspaceDefinitions; reset(): void; counts(): Counts }[] = [];
    for (const definition of definitions) {
      const { WorkspaceDefinitions: Provider } = await import(pathToFileURL(resolve(definition.source, 'workspace-definitions.ts')).href);
      const { ParserClient: Client } = await import(pathToFileURL(resolve(definition.dist, 'parser-client.js')).href);
      const client: ParserClient = new Client();
      let counts = empty();
      const symbols = client.symbols.bind(client);
      client.symbols = (snapshot, signal, offset) => {
        if (snapshot.key.startsWith('workspace-symbols:')) counts.summaries++;
        return symbols(snapshot, signal, offset);
      };
      const provider: WorkspaceDefinitions = new Provider(client, {
        stat: (uri: VSCode.Uri) => vscode.workspace.fs.stat(uri),
        readDirectory: (uri: VSCode.Uri) => { counts.directories++; return vscode.workspace.fs.readDirectory(uri); },
        readFile: (uri: VSCode.Uri) => { counts.files++; return vscode.workspace.fs.readFile(uri); },
      });
      // Worker startup is excluded; cold means inventory and candidate-summary caches are empty.
      for (const fixture of fixtures) await client.symbols({ key: fixture.document.uri.toString(), source: fixture.document.getText(), version: fixture.document.version, script: false });
      variants.push({ ...definition, client, provider, reset: () => { counts = empty(); }, counts: () => ({ ...counts }) });
    }
    try {
      for (const fixture of fixtures) for (const cold of [true, false]) {
        const name = `${fixture.name}/${cold ? 'cold' : 'warm'}`;
        for (const v of variants) v.provider.clear();
        for (let i = -warmups; i < samples; i++) {
          const order = (i + warmups + round) % 2 ? [...variants].reverse() : variants;
          for (const v of order) {
            if (cold) v.provider.clear();
            v.reset();
            const start = performance.now();
            const targets = await v.provider.resolve(fixture.document, [], controller.signal, cancellation.token, fixture.offset);
            const ms = performance.now() - start;
            assert.deepEqual(targets.map(t => t.targetUri.toString()), [fixture.target], `${v.name}: ${name}`);
            if (i >= 0) raw.push({ variant: v.name, case: name, round, ms, ...v.counts() });
          }
        }
        console.log(`navigation benchmark: round ${round + 1}/${rounds}, ${name}`);
      }
    } finally {
      for (const v of variants) { v.provider.dispose(); await v.client.dispose(); }
    }
  }
  cancellation.dispose();
  const summary = [...new Set(raw.map(s => s.case))].flatMap(name => definitions.map(v => {
    const rows = raw.filter(s => s.case === name && s.variant === v.name);
    return { case: name, variant: v.name, samples: rows.length, p50: percentile(rows.map(r => r.ms), .5), p95: percentile(rows.map(r => r.ms), .95),
      directories: percentile(rows.map(r => r.directories), .5), files: percentile(rows.map(r => r.files), .5), summaries: percentile(rows.map(r => r.summaries), .5) };
  }));
  const wasm = await Promise.all(definitions.map(async v => ({ variant: v.name, hash: createHash('sha256').update(await readFile(resolve(v.dist, 'parser/kotlin-parser.wasm'))).digest('hex') })));
  await writeFile(resolve(output, 'workspace-navigation.json'), JSON.stringify({ timestamp: new Date().toISOString(), node: process.version, vscode: vscode.version, cpu: cpus()[0].model,
    warmups, samples, rounds, order: 'alternating paired variants; fresh clients per round', cold: 'workspace caches cleared; worker and OS caches warm', inputs, wasm, sourceHashes, summary, raw }, null, 2));
  const lines = ['# Workspace navigation comparison', '', `VS Code ${vscode.version}; ${rounds} rounds, ${warmups} warmups and ${samples} samples per case per round.`,
    'Alternating paired variants. Fresh Workers per round; startup excluded. Cold clears workspace inventory and summary caches, not OS caches. Synthetic fixtures; no editor rendering latency.', '',
    '| Case | Variant | N | P50 ms | P95 ms | Directory reads | File reads | Summary requests |', '|---|---|---:|---:|---:|---:|---:|---:|',
    ...summary.map(s => `| ${s.case} | ${s.variant} | ${s.samples} | ${s.p50.toFixed(3)} | ${s.p95.toFixed(3)} | ${s.directories} | ${s.files} | ${s.summaries} |`)];
  await writeFile(resolve(output, 'workspace-navigation.md'), lines.join('\n') + '\n');
  await writeFile(resolve(project, 'kotlin-vscode/build/host-result.json'), JSON.stringify({ passed: true, benchmark: output, cases: summary.length, samples: raw.length }));
}
