import { readFile } from 'node:fs/promises';
import { deepStrictEqual } from 'node:assert';
import { tokenize, parseFile, parseScript } from '../dist/kotlin-parser.mjs';
const fixtures = JSON.parse(await readFile(new URL('../build/oracle/lexer.json', import.meta.url), 'utf8'));
for (const { source, tokens } of fixtures) deepStrictEqual(JSON.parse(tokenize(source)), tokens, JSON.stringify(source));
console.log(`WASM package matches ${fixtures.length} JVM-verified official lexer fixtures`);
const parserFixtures = JSON.parse(await readFile(new URL('../build/oracle/parser.json', import.meta.url), 'utf8'));
for (const { source, script, tree } of parserFixtures) deepStrictEqual(JSON.parse(script ? parseScript(source) : parseFile(source)), tree, JSON.stringify(source));
console.log(`WASM package matches ${parserFixtures.length} JVM-verified official parser fixtures`);
