import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';

const root = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync(process.execPath, ['scripts/gradle.ts', ':kotlin-format:compileProductionExecutableKotlinWasmJs'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
const out = new URL('../dist/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL('../build/compileSync/wasmJs/main/productionExecutable/kotlin/', import.meta.url), out, { recursive: true });
await cp(new URL('../../LICENSE', import.meta.url), new URL('LICENSE', out));
await build({
  config: false,
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  entry: ['js/cli.ts', 'js/config.ts'],
  outDir: 'dist', format: 'esm', platform: 'node', clean: false,
  deps: { alwaysBundle: ['ignore'], neverBundle: ['../dist/kotlin-format.mjs'] },
  outputOptions: { paths: id => id.replace(/^(?:.*[/\\])?kotlin-format\.mjs$/, './kotlin-format.mjs') },
  dts: { generator: 'oxc' },
});
