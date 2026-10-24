import { build } from 'tsdown';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync(process.execPath, ['scripts/gradle.ts', ':kotlin-parser:compileProductionExecutableKotlinWasmJs'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
const out = new URL('../dist/', import.meta.url);
if (dirname(fileURLToPath(out).replace(/[\\/]$/, '')) !== resolve(root, 'kotlin-parser')) throw new Error('Unexpected output directory');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL('../build/compileSync/wasmJs/main/productionExecutable/kotlin/', import.meta.url), out, { recursive: true });
// Kotlin/Wasm exports JsAny as NonNullable<unknown>; the result is a native Int32Array.
const declarations = new URL('kotlin-parser.d.mts', out);
await writeFile(declarations, (await readFile(declarations, 'utf8')).replace(
  'documentClassifications(id: number): NonNullable<unknown>', 'documentClassifications(id: number): Int32Array<ArrayBuffer>',
));
const { tokenLegend } = await import('../dist/kotlin-parser.mjs');
const { types, modifiers } = JSON.parse(tokenLegend());
await mkdir(new URL('../js/generated/', import.meta.url), { recursive: true });
await writeFile(new URL('../js/generated/legend.ts', import.meta.url),
  `// Generated from the Kotlin token definitions.
export const tokenTypes: string[] = ${JSON.stringify(types)};
export const tokenModifiers: string[] = ${JSON.stringify(modifiers)};
`);
await build({
  config: false,
  cwd: resolve(root, 'kotlin-parser'),
  entry: ['js/index.ts', 'js/shared.ts'],
  deps: { neverBundle: ['../dist/kotlin-parser.mjs'] },
  outputOptions: {
    paths: id => id.replace(/^(?:.*[/\\])?kotlin-parser\.mjs$/, './kotlin-parser.mjs'),
  },
  outDir: 'dist',
  format: 'esm',
  platform: 'neutral',
  dts: { generator: 'oxc' },
  clean: false,
});
