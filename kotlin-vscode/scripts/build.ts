import { build } from 'tsdown';
import { cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await build({
  config: false,
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  entry: ['src/extension.ts', 'src/parser-worker.ts', 'src/parser-client.ts', 'src/protocol.ts', 'src/highlights.ts', 'src/format-worker.ts', 'src/format-client.ts'],
  outDir: 'dist',
  format: 'esm',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  platform: 'node',
  deps: {
    alwaysBundle: ['kotlin-parser/editor', 'ignore'],
    neverBundle: ['vscode', 'kotlin-parser/wasm', 'kotlin-format/wasm', 'kotlin-format/config'],
  },
  outputOptions: {
    paths: id => id === 'kotlin-parser/wasm' ? './parser/kotlin-parser.mjs' : id === 'kotlin-format/wasm' ? './format/kotlin-format.mjs' : id === 'kotlin-format/config' ? './format/config.mjs' : id,
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
await cp(new URL('../../kotlin-format/dist/', import.meta.url), new URL('../dist/format/', import.meta.url), { recursive: true });
