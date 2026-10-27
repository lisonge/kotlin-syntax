import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlights } from './legacy-highlights.ts';
import { tokenTypes } from 'kotlin-parser/editor';
import { tokenDelta } from '../dist/highlights.js';
import * as parser from '../dist/parser/kotlin-parser.mjs';
test('semantic token deltas reconstruct every update', () => {
  const arrays = [[], [0, 1, 2, 3, 4], [0, 1, 3, 3, 4], [0, 1, 2, 3, 4, 1, 0, 2, 2, 0], [2, 0, 1, 1, 0]];
  for (const a of arrays) for (const b of arrays) {
    const edit = tokenDelta(Uint32Array.from(a), Uint32Array.from(b));
    const result = [...a]; result.splice(edit.start, edit.deleteCount, ...edit.data);
    assert.deepEqual(result, b);
  }
});
test('packaged document lifecycle and UTF-16 sequential edits', () => {
  let text = 'class A {}\nclass B {}\nclass C {}\nval x = "😀"';
  const id = parser.openDocument(text, false);
  assert.deepEqual(JSON.parse(parser.documentTree(id)), JSON.parse(parser.parseFile(text)));
  for (const [start, end, insertion] of [[text.length, text.length, '\nval n = 42'], [6, 7, 'Renamed'], [0, 0, '/*'], [0, 2, ''], [10, 10, '*/']] as const) {
    text = text.slice(0, start) + insertion + text.slice(end);
    assert.deepEqual(JSON.parse(parser.editDocument(id, start, end, insertion)), JSON.parse(parser.parseFile(text)));
  }
  parser.closeDocument(id); parser.closeDocument(id);
  assert.throws(() => parser.documentTree(id));
});
test('syntax classifications and nonoverlapping UTF-16 spans', () => {
  const source = '@Anno class Box<T>(val value: T) { fun call(p: Int) = p + 1 }\ninterface Service {}';
  const spans = highlights(JSON.parse(parser.parseFile(source)));
  let previous = 0;
  for (const span of spans) { assert.ok(span.start >= previous && span.end <= source.length); previous = span.end; }
  for (const [text, type] of [['Anno', 'decorator'], ['Box', 'class'], ['T', 'typeParameter'], ['call', 'method'], ['p', 'parameter'], ['Service', 'interface']])
    assert.ok(spans.some(s => source.slice(s.start, s.end) === text && tokenTypes[s.type] === type), `${text}: ${type}`);
});

test('packaged lexer, file and script entry points', () => {
  const { tokenize, parseFile, parseScript } = parser;
  assert.ok(JSON.parse(tokenize('val answer = 42')).length);
  const tree = JSON.parse(parseFile('@file:JvmName("Sample")\npackage sample\nimport kotlin.Int\n@A(types = [String::class]) class Box(val value: Int)\nfun String?.apply(action: context(Logger) (Int) -> Unit) { if (this != null) action(1) }'));
  assert.equal(tree.kind, 'KT_FILE');
  for (const kind of ['CLASS', 'FUN', 'FILE_ANNOTATION_LIST']) {
    assert.ok(tree.children.some((node: { kind: string }) => node.kind === kind), kind);
  }
  const script = JSON.parse(parseScript('val f = { x: Int -> x + 1 }\nprintln(f(2))'));
  assert.ok(script.children.some((node: { kind: string }) => node.kind === 'SCRIPT'));
});
