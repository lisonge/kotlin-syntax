import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { kotlinFiles, type DirectoryAccess } from '../kotlin-vscode/src/workspace-files.ts';

const root = resolve(process.argv[2]);
// Compare directory policies using the same walker and Node filesystem adapter.
// This does not reproduce the former VS Code findFiles implementation.
const source = await readFile('kotlin-vscode/src/workspace-files.ts', 'utf8');
const condition = "name.startsWith('.') || excluded.has(name)";
assert.ok(source.includes(condition));
await mkdir('kotlin-vscode/build', { recursive: true });
const variant = resolve('kotlin-vscode/build/workspace-files-previous.ts');
await writeFile(variant, source.replace(condition, "['.git', '.gradle', '.idea'].includes(name) || excluded.has(name)"));
const previous: typeof kotlinFiles = (await import(pathToFileURL(variant).href)).kotlinFiles;
const modes = ['fixed', 'gitignore', 'current'] as const;
const samples = Object.fromEntries(modes.map(mode => [mode, [] as number[]]));
const counts: Record<string, unknown> = {};
for (let round = -5; round < 30; round++) {
  for (let order = 0; order < 3; order++) {
    const mode = modes[(round + 6 + order) % 3];
    let directories = 0;
    let localVisited = false;
    const access: DirectoryAccess = {
      entries: async path => {
        directories++;
        localVisited ||= path.startsWith('.local/');
        return (await readdir(join(root, path), { withFileTypes: true })).map(entry => ({ name: entry.name, directory: entry.isDirectory(), file: entry.isFile() }));
      },
      ignoreFile: async path => {
        if (mode === 'fixed') return undefined;
        try { return await readFile(join(root, path, '.gitignore'), 'utf8'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
      },
    };
    const start = performance.now();
    const files = await (mode === 'current' ? kotlinFiles : previous)(access, () => false);
    const elapsed = performance.now() - start;
    if (mode === 'current') assert.ok(!localVisited);
    counts[mode] = { files: files.length, directories, localVisited };
    if (round >= 0) samples[mode].push(elapsed);
  }
}
const stats = Object.fromEntries(modes.map(mode => {
  const values = [...samples[mode]].sort((a, b) => a - b);
  return [mode, { medianMs: (values[14] + values[15]) / 2, p95Ms: values[28], samples: values.length }];
}));
const report = { root, node: process.version, counts, stats, samples,
  scope: '5 warmups, 30 rotated samples per policy. Warm filesystem-cache Node directory enumeration only, not VS Code RPC or end-to-end navigation. Source files are not read or parsed.' };
await mkdir('build/benchmarks', { recursive: true });
await writeFile('build/benchmarks/workspace-speed.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, samples: undefined }, null, 2));
