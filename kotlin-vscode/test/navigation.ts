import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as parser from '../dist/parser/kotlin-parser.mjs';
import { resolveNavigation } from '../src/navigation.ts';
import { matchesCounterpart } from '../src/expect-actual.ts';
import { NameResolver } from '../src/type-resolution.ts';
import { declarationPaths, samePath, type SymbolContext, type SymbolLookup } from '../src/symbols.ts';
import type { FileSymbols } from '../src/protocol.ts';

function document(file: string, source: string, word = 'work') {
  const id = parser.openDocument(source, false);
  try {
    const offset = source.lastIndexOf(word);
    const symbols: FileSymbols = JSON.parse(parser.documentSymbols(id));
    symbols.query = JSON.parse(parser.documentNavigationQuery(id, offset));
    return { file, symbols, offset, ranges: [...parser.documentDefinitions(id, offset)] };
  } finally { parser.closeDocument(id); }
}
const lookup = (files: SymbolContext[]): SymbolLookup => async path => files.flatMap(file => file.symbols.declarations
  .filter(d => declarationPaths(d).some(parts => samePath([...file.symbols.packageName, ...parts], path)))
  .map(declaration => ({ ...file, declaration })));
const member = (file: SymbolContext, name: string) => ({ ...file, declaration: file.symbols.declarations.find(d => d.name === name)! });

test('moving a nested receiver type to another file preserves the single-file target', async () => {
  for (const initializer of ['val value: Value = Value()', 'val value = Value()']) {
    const model = `package demo\nclass Box { class Value { fun work() {} }; ${initializer} }`;
    const call = 'fun use(box: Box) { box.value.work() }';
    const single = document('Single.kt', model + '\n' + call);
    assert.equal(single.ranges[2], model.indexOf('work'), initializer);
    const modelDoc = document('Model.kt', model);
    const caller = document('Caller.kt', 'package demo\n' + call);
    const unrelated = document('Other.kt', 'package demo\nclass Value { fun work() {} }');
    for (const files of [[modelDoc, caller], [modelDoc, caller, unrelated]]) {
      const targets = await resolveNavigation(caller, new NameResolver(lookup(files)));
      assert.deepEqual(targets.map(t => [t.file, t.declaration.path]), [['Model.kt', ['Box', 'Value', 'work']]], initializer);
    }
  }
});

test('alias targets retain the declaring scope through receiver chains', async () => {
  const model = document('Model.kt', `package demo
import other.Value as Remote
typealias Alias = Remote
class Box { val value: Alias? = null }
class Value { fun work() {} }`);
  const remote = document('Remote.kt', 'package other\nclass Value { fun work() {} }');
  const caller = document('Caller.kt', 'package demo\nfun use(box: Box) { box.value?.work() }');
  const targets = await resolveNavigation(caller, new NameResolver(lookup([model, remote, caller])));
  assert.deepEqual(targets.map(t => [t.file, t.declaration.path]), [['Remote.kt', ['Value', 'work']]]);
});

test('member and signature resolution share enclosing, explicit-import and package priorities', async () => {
  const from = document('Common.kt', `package demo
import other.Value
class Value
expect class Box { class Value; fun work(value: Value) }
expect fun use(value: Value)`);
  const to = document('Actual.kt', `package demo
actual class Box { actual class Value; actual fun work(value: demo.Box.Value) {} }
actual fun use(value: other.Value) {}`);
  const resolver = new NameResolver(lookup([from, to]));
  for (const name of ['work', 'use']) {
    const a = member(from, name), b = member(to, name);
    assert.ok(await matchesCounterpart(a, b, resolver));
    const binding = await resolver.type(['Value'], a);
    assert.equal(binding.status, 'resolved');
    if (binding.status === 'resolved') assert.deepEqual(binding.value.path, name === 'work' ? ['demo', 'Box', 'Value'] : ['other', 'Value']);
  }
});

test('ambiguous and unavailable wildcard types never create signature matches', async () => {
  const a = document('A.kt', 'package a\nclass Value');
  const b = document('B.kt', 'package b\nclass Value');
  for (const imports of ['import a.*\nimport b.*', 'import unavailable.*']) {
    const from = document('Common.kt', `package demo\n${imports}\nexpect fun work(value: Value)`);
    const to = document('Actual.kt', `package demo\n${imports}\nactual fun work(value: Value) {}`);
    const resolver = new NameResolver(lookup([a, b, from, to]));
    const type = await resolver.type(['Value'], member(from, 'work'));
    assert.equal(type.status, imports.includes('unavailable') ? 'unresolved' : 'ambiguous');
    assert.equal(await matchesCounterpart(member(from, 'work'), member(to, 'work'), resolver), false);
  }
});

test('unresolved names do not acquire fabricated default-package identities', async () => {
  const from = document('Common.kt', 'package demo\nexpect fun work(value: Missing)');
  const to = document('Actual.kt', 'package demo\nactual fun work(value: kotlin.Missing) {}');
  const resolver = new NameResolver(lookup([from, to]));
  assert.equal((await resolver.type(['Missing'], member(from, 'work'))).status, 'unresolved');
  assert.equal(await matchesCounterpart(member(from, 'work'), member(to, 'work'), resolver), false);
});

test('private types are visible in their declaration file but do not shadow another file defaults', async () => {
  const model = document('Model.kt', 'package demo\nprivate class Result\nfun work(value: Result) {}');
  const caller = document('Caller.kt', 'package demo\nfun work(value: Result<String>) {}');
  const resolver = new NameResolver(lookup([model, caller]));
  const local = await resolver.type(['Result'], member(model, 'work'));
  const external = await resolver.type(['Result'], member(caller, 'work'));
  assert.equal(local.status, 'resolved'); assert.equal(external.status, 'resolved');
  if (local.status === 'resolved' && external.status === 'resolved') {
    assert.deepEqual(local.value.path, ['demo', 'Result']);
    assert.deepEqual(external.value.path, ['kotlin', 'Result']);
  }
});

test('ordinary overloads remain multiple navigation targets without enabling constructor inference', async () => {
  const library = document('Library.kt', 'package demo\nfun build() = 1\nfun build(value: Int) = value');
  const caller = document('Caller.kt', 'package demo\nfun use() { build() }', 'build');
  const resolver = new NameResolver(lookup([library, caller]));
  const overloads = await resolver.declarations(['build'], caller);
  assert.equal(overloads.status, 'ambiguous');
  if (overloads.status === 'ambiguous') assert.equal(overloads.candidates.length, 2);
  const invalid = document('Invalid.kt', 'package demo\nval item = build()\nfun use() { item.work() }');
  assert.deepEqual(await resolveNavigation(invalid, new NameResolver(lookup([library, invalid]))), []);
});
