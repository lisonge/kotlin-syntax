import { build } from 'tsdown';
import { cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await build({
  config: false,
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  entry: ['src/extension.ts', 'src/parser-worker.ts', 'src/parser-client.ts', 'src/protocol.ts', 'src/highlights.ts'],
  outDir: 'dist',
  format: 'esm',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  platform: 'node',
  deps: {
    alwaysBundle: ['kotlin-parser/shared', 'ignore'],
    neverBundle: ['vscode', 'kotlin-parser/wasm'],
  },
  outputOptions: {
    paths: id => id === 'kotlin-parser/wasm' ? './parser/kotlin-parser.mjs' : id,
  },
  dts: { generator: 'oxc' },
});
const source = new URL('../../kotlin-parser/dist/', import.meta.url);
const destination = new URL('../dist/parser/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of await readdir(source)) {
  if (name.endsWith('.mjs') || name.endsWith('.wasm') || name.endsWith('.d.mts')) {
    await cp(new URL(name, source), new URL(name, destination));
  }
}
console.log('Extension built with tsdown: ESM entries and Kotlin WASM assets.');
