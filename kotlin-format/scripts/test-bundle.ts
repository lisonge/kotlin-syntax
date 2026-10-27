import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatWithOptions, formatCode } from '../dist/kotlin-format.mjs';

const fixtures: { name: string; source: string; expected: string; second: string; script: boolean; maxWidth: number; blockIndent: number; continuationIndent: number; trailingCommas: string; removeUnusedImports: boolean; preserveLambdaBreaks: boolean }[] = JSON.parse(await readFile(new URL('../build/oracle/formatter.json', import.meta.url), 'utf8'));
for (const f of fixtures) {
  const run = (source: string) => formatWithOptions(source, f.maxWidth, f.blockIndent, f.continuationIndent, f.trailingCommas, f.removeUnusedImports, f.preserveLambdaBreaks, f.script);
  assert.equal(run(f.source), f.expected, f.name);
  assert.equal(run(f.expected), f.second, `${f.name}: second pass`);
}
assert.equal(formatCode('fun f(){println("😀")}', 'KOTLINLANG', 100, false), 'fun f() {\n    println("😀")\n}\n');
assert.throws(() => formatCode('fun {', 'KOTLINLANG', 100, false));
console.log(`WASM formatter matched ${fixtures.length} official ktfmt cases and second passes (${fixtures.filter(f => f.expected === f.second).length} idempotent).`);
