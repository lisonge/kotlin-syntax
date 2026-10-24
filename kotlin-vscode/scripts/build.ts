import { spawn } from 'node:child_process';
import { tokenize, parseFile, parseScript } from 'kotlin-parser';
import { mkdir, cp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const tokens = JSON.parse(tokenize('val answer = 42'));
if (!tokens.length) throw new Error('WASM lexer smoke test failed');
const tree = JSON.parse(parseFile('@file:JvmName("Sample")\npackage sample\nimport kotlin.Int\n@A(types = [String::class]) class Box(val value: Int)\nfun String?.apply(action: context(Logger) (Int) -> Unit) { if (this != null) action(1) }'));
if (tree.kind !== 'KT_FILE' || !['CLASS', 'FUN', 'FILE_ANNOTATION_LIST'].every(kind =>
  tree.children.some((node: { kind: string }) => node.kind === kind))) {
  throw new Error('WASM parser smoke test failed');
}
const script = JSON.parse(parseScript('val f = { x: Int -> x + 1 }\nprintln(f(2))'));
if (!script.children.some((node: { kind: string }) => node.kind === 'SCRIPT')) throw new Error('WASM script smoke test failed');
const out = fileURLToPath(new URL('../dist/', import.meta.url)).replace(/[\\/]$/, '');
if (dirname(out) !== resolve(fileURLToPath(new URL('../', import.meta.url)))) throw new Error('Unexpected output directory');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(fileURLToPath(new URL('../../kotlin-parser/dist/', import.meta.url)), fileURLToPath(new URL('../dist/parser/', import.meta.url)), { recursive: true });
const child = spawn(process.execPath, [fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url)), '-p', fileURLToPath(new URL('../tsconfig.build.json', import.meta.url))], { stdio: 'inherit' });
const code = await new Promise((accept, reject) => { child.on('exit', accept); child.on('error', reject); });
if (code !== 0) throw new Error(`Extension compilation failed: ${code}`);
console.log('Extension built: ESM JavaScript and WASM assets.');
