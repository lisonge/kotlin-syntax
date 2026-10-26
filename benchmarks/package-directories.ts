import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, posix } from 'node:path';
import assert from 'node:assert/strict';
import { kotlinFiles, type DirectoryAccess } from '../kotlin-vscode/src/workspace-files.ts';

const root = resolve(process.argv[2]);
let visits = 0;
const access: DirectoryAccess = {
  entries: async path => {
    visits++;
    return (await readdir(join(root, path), { withFileTypes: true })).map(entry => ({ name: entry.name, directory: entry.isDirectory(), file: entry.isFile() }));
  },
  ignoreFile: async path => {
    try { return await readFile(join(root, path, '.gitignore'), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  },
};
const initial = performance.now();
const all = await kotlinFiles(access, () => false);
const initialMs = performance.now() - initial;
const directories = new Set(all.map(path => posix.dirname(path) + '/').filter(path =>
  ['li/', 'li/gkd/', 'li/gkd/db/', 'li/gkd/db/Db/'].some(suffix => path.endsWith('/' + suffix))));
assert.ok(directories.size);
const expected = all.filter(path => directories.has(posix.dirname(path) + '/')).sort();
const samples: Record<string, number[]> = { full: [], directed: [] };
const counts: Record<string, number> = {};
for (let round = -5; round < 30; round++) {
  for (const mode of round % 2 ? ['full', 'directed'] : ['directed', 'full']) {
    visits = 0;
    const start = performance.now();
    const files = await kotlinFiles(access, () => false, mode === 'directed' ? directories : undefined);
    const elapsed = performance.now() - start;
    if (mode === 'directed') assert.deepEqual(files.sort(), expected);
    counts[mode] = visits;
    if (round >= 0) samples[mode].push(elapsed);
  }
}
const stats = Object.fromEntries(Object.entries(samples).map(([mode, values]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return [mode, { medianMs: (sorted[14] + sorted[15]) / 2, p95Ms: sorted[28] }];
}));
const report = { root, query: 'li.gkd.db.Db', initialMs, counts, stats, samples, selectedDirectories: [...directories], candidateFiles: expected.length,
  scope: '5 warmups, 30 alternating samples; Node filesystem adapter, warm filesystem cache. Directory inventory reused for directed lookup. Excludes VS Code RPC, file reads and parsing.' };
await mkdir('build/benchmarks', { recursive: true });
await writeFile('build/benchmarks/package-directories.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, samples: undefined }, null, 2));
