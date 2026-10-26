import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { kotlinFiles } from '../kotlin-vscode/src/workspace-files.ts';

const root = resolve(process.argv[2]);
const visited: string[] = [];
const start = performance.now();
const files = await kotlinFiles({
  entries: async path => {
    visited.push(path);
    return (await readdir(join(root, path), { withFileTypes: true })).map(entry => ({ name: entry.name, directory: entry.isDirectory(), file: entry.isFile() }));
  },
  ignoreFile: async path => {
    try { return await readFile(join(root, path, '.gitignore'), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  },
}, () => false);
assert.ok(!visited.some(path => path === '.local/' || path.startsWith('.local/')));
assert.ok(!files.some(path => path.startsWith('.local/')));
const report = { root, files: files.length, visitedDirectories: visited.length, elapsedMs: performance.now() - start,
  localDirectoryVisited: false, scope: 'Single read-only enumeration validation, not a performance benchmark', paths: files };
await mkdir('build/benchmarks', { recursive: true });
await writeFile('build/benchmarks/workspace-files.json', JSON.stringify(report, null, 2));
console.log({ ...report, paths: undefined });
