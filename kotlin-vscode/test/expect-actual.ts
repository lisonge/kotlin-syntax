import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as parser from '../dist/parser/kotlin-parser.mjs';
import type { Declaration, FileSymbols } from '../src/protocol.ts';
import { counterpartAt, matchesCounterpart as matchCounterpart, sourceSetLocation } from '../src/expect-actual.ts';

import { NameResolver } from '../src/type-resolution.ts';
import { declarationPaths, samePath, type SymbolLookup } from '../src/symbols.ts';

const ids = new WeakMap<FileSymbols, string>();
let serial = 0;
const context = (symbols: FileSymbols) => {
  if (!ids.has(symbols)) ids.set(symbols, String(++serial));
  return { file: ids.get(symbols)!, symbols };
};
const lookupFiles = (files: FileSymbols[]): SymbolLookup => async path => files.flatMap(symbols => symbols.declarations
  .filter(d => declarationPaths(d).some(parts => samePath([...symbols.packageName, ...parts], path)))
  .map(declaration => ({ ...context(symbols), declaration })));
async function matchesCounterpart(from: Declaration, source: FileSymbols, to: Declaration, target: FileSymbols, lookup?: SymbolLookup) {
  const resolver = new NameResolver(async (path, ctx) => [
    ...await lookupFiles([source, target])(path, ctx), ...await lookup?.(path, ctx) ?? [],
  ]);
  return matchCounterpart({ ...context(source), declaration: from }, { ...context(target), declaration: to }, resolver);
}

function symbols(source: string): FileSymbols {
  const id = parser.openDocument(source, false);
  try { return JSON.parse(parser.documentSymbols(id)); } finally { parser.closeDocument(id); }
}
async function matches(from: Declaration, source: FileSymbols, target: FileSymbols, lookup?: SymbolLookup) {
  const result: Declaration[] = [];
  for (const to of target.declarations) if (await matchesCounterpart(from, source, to, target, lookup)) result.push(to);
  return result;
}
async function pairs(common: string, platform: string) {
  const a = symbols(common), b = symbols(platform);
  return Promise.all(a.declarations.filter(d => d.expectActual).map(async from => ({ path: from.path, kind: from.kind,
    targets: await matches(from, a, b) })));
}

test('pairs functions, properties, classifiers, implicit members and both constructors', async () => {
  const results = await pairs(`package demo
expect suspend fun String.work(value: Int): String
expect val String.size: Int
expect class Box<T>(value: T) {
  constructor(value: T, size: Int)
  val value: T
  fun read(): T
  class Nested
  companion object { fun make(): Box<Int> }
}
expect interface Driver
expect object Env
expect enum class Mode { A, B }
expect annotation class Marker`, `package demo
actual suspend fun String.work(value: Int) = this
actual val String.size get() = length
actual class Box<U> actual constructor(actual val value: U) {
  actual constructor(value: U, size: Int): this(value)
  actual fun read() = value
  actual class Nested
  actual companion object { actual fun make() = Box(1) }
  fun extra() {}
}
actual interface Driver
actual object Env
actual enum class Mode { A, B, C }
actual annotation class Marker`);
  assert.equal(results.length, 16);
  for (const item of results) assert.equal(item.targets.length, 1, `${item.path.join('.')} ${item.kind}`);
});

test('narrows overloads by receiver, parameter types, suspend and generic arity', async () => {
  const results = await pairs(`package demo
import kotlin.collections.List as Items
expect fun <T> T.convert(items: Items<T>, block: (name: String) -> Int): T`, `package demo
actual fun <U> U.convert(items: List<U>, block: (String) -> kotlin.Int): U = this
actual fun <U> U.convert(items: Set<U>, block: (String) -> Int): U = this
actual fun <U> String.convert(items: List<U>, block: (String) -> Int) = this
actual suspend fun <U> U.convert(items: List<U>, block: (String) -> Int): U = this
actual fun <U, V> U.convert(items: List<U>, block: (String) -> Int): U = this`);
  assert.equal(results[0].targets.length, 1);
  assert.equal(results[0].targets[0].nameStart, 'package demo\nactual fun <U> U.'.length);
});

test('context function type keywords remain structure while their receiver types resolve normally', async () => {
  const results = await pairs('package demo\nexpect fun work(block: context(String) (Int) -> Unit)',
    'package demo\nactual fun work(block: context(kotlin.String) (kotlin.Int) -> kotlin.Unit) {}');
  assert.equal(results[0].targets.length, 1);
});

test('generic outer types retain qualification across nested type arguments in both directions', async () => {
  const common = symbols(`package demo
class Outer<T> { inner class Inner<U> { inner class Leaf } }
class Inner
expect fun use(value: Outer<List<String>>.Inner<Int>.Leaf)`);
  const actual = symbols(`package demo
import demo.Outer as Container
actual fun use(value: Container<kotlin.collections.List<kotlin.String>>.Inner<kotlin.Int>.Leaf) {}
actual fun use(value: Container<List<Int>>.Inner<Int>.Leaf) {}
actual fun use(value: Container<List<String>>.Inner<String>.Leaf) {}`);
  const from = common.declarations.find(d => d.name === 'use')!;
  assert.deepEqual(await matches(from, common, actual), [actual.declarations[0]]);
  assert.deepEqual(await matches(actual.declarations[0], actual, common), [from]);
});

test('context parameter types and count distinguish overloads while names and aliases do not', async () => {
  const common = symbols(`package demo
class First
class Second
context(first: First) expect fun load()
context(second: Second) expect fun load()
context(first: First, second: Second) expect fun load()`);
  const actual = symbols(`package demo
import demo.First as One
context(renamed: One) actual fun load() {}
context(_: demo.Second) actual fun load() {}
context(a: One, b: demo.Second) actual fun load() {}
context(a: demo.Second, b: One) actual fun load() {}`);
  const from = common.declarations.filter(d => d.name === 'load');
  for (const [i, declaration] of from.entries()) {
    assert.deepEqual(await matches(declaration, common, actual), [actual.declarations[i]]);
    assert.deepEqual(await matches(actual.declarations[i], actual, common), [declaration]);
  }
});

test('actual typealias matches expected classifiers in either direction', async () => {
  const a = symbols('package demo\nexpect class Date\nexpect interface Driver\nexpect fun Date(): Int');
  const b = symbols('package demo\nactual typealias Date = java.time.LocalDate\nactual typealias Driver = external.Driver');
  for (const to of b.declarations) {
    const found = await matches(to, b, a);
    assert.equal(found.length, 1);
    assert.ok(await matchesCounterpart(found[0], a, to, b));
  }
  assert.equal((await pairs('package a\nexpect class Date', 'package b\nactual class Date'))[0].targets.length, 0);
  assert.equal((await pairs('expect class Date', 'expect class Date'))[0].targets.length, 0);
});

test('equivalent default imports, wildcard imports and nested type spellings match in both directions', async () => {
  const cases = [
    ['expect fun use(value: ArrayList<String>)', 'actual fun use(value: kotlin.collections.ArrayList<String>) {}'],
    ['expect fun use(value: ArrayList<String>)', 'import kotlin.collections.ArrayList\nactual fun use(value: ArrayList<String>) {}'],
    ['import kotlin.collections.ArrayList as Items\nexpect fun use(value: Items<String>)', 'actual fun use(value: ArrayList<String>) {}'],
    ['import other.*\nexpect fun use(value: User)', 'import other.User\nactual fun use(value: User) {}'],
    ['import other.User\nexpect fun use(value: User)', 'import other.*\nactual fun use(value: User) {}'],
    ['import other.*\nexpect fun User.use(value: List<User>)', 'actual fun other.User.use(value: kotlin.collections.List<other.User>) {}'],
    ['class Outer { class Inner }\nexpect fun use(value: Outer.Inner)', 'import demo.Outer.Inner\nactual fun use(value: Inner) {}'],
    ['expect class Outer { class Inner; fun use(value: Inner) }', 'actual class Outer { actual class Inner; actual fun use(value: demo.Outer.Inner) {} }'],
    ['expect fun use(value: Outer.Inner)', 'actual fun use(value: demo.Outer.Inner) {}'],
  ];
  const lookup = lookupFiles([symbols('package other\nclass User'), symbols('package demo\nclass Outer { class Inner }')]);
  for (const [common, platform] of cases) {
    const a = symbols('package demo\n' + common), b = symbols('package demo\n' + platform);
    const from = a.declarations.find(d => d.name === 'use')!;
    const to = b.declarations.find(d => d.name === 'use')!;
    assert.ok(await matchesCounterpart(from, a, to, b, lookup), common + '\n' + platform);
    assert.ok(await matchesCounterpart(to, b, from, a, lookup), 'reverse: ' + common);
  }
});

test('type spelling normalization preserves explicit identities, local shadowing and overload distinctions', async () => {
  const cases = [
    ['import first.User\nexpect fun use(value: User)', 'import second.User\nactual fun use(value: User) {}'],
    ['import first.*\nexpect fun use(value: User)', 'import second.User\nactual fun use(value: User) {}'],
    ['class ArrayList<T>\nexpect fun use(value: ArrayList<String>)', 'actual fun use(value: kotlin.collections.ArrayList<String>) {}'],
    ['expect class Outer { class Inner; fun use(value: Inner) }', 'import other.Inner\nactual class Outer { actual fun use(value: Inner) {} }'],
    ['expect fun use(value: ArrayList<Int>)', 'actual fun use(value: kotlin.collections.ArrayList<String>) {}'],
    ['expect fun use(value: List<String?>)', 'actual fun use(value: kotlin.collections.List<String>) {}'],
  ];
  for (const [common, platform] of cases) {
    const result = (await pairs('package demo\n' + common, 'package demo\n' + platform)).find(d => d.path.at(-1) === 'use')!;
    assert.equal(result.targets.length, 0, common + '\n' + platform);
  }
});

test('verified wildcard types distinguish same-named overloads in both directions', async () => {
  const types = ['package model.a\nclass User', 'package model.b\nclass User', 'package local\nclass User'].map(symbols);
  const lookup = lookupFiles(types);
  const common = ['a', 'b'].map(name => symbols(`package demo\nimport model.${name}.*\nexpect fun User.save(value: List<User>, count: Int)`));
  const actual = ['a', 'b'].map(name => symbols(`package demo\nimport model.${name}.*\nactual fun User.save(value: List<User>, count: Int) {}`));
  for (let i = 0; i < common.length; i++) for (let j = 0; j < actual.length; j++) {
    assert.equal(await matchesCounterpart(common[i].declarations[0], common[i], actual[j].declarations[0], actual[j], lookup), i === j);
    assert.equal(await matchesCounterpart(actual[j].declarations[0], actual[j], common[i].declarations[0], common[i], lookup), i === j);
  }
  // An actual package binding still precedes a wildcard import from another package.
  const local = symbols('package local\nimport model.a.*\nexpect fun save(value: User)');
  const platform = symbols('package local\nactual fun save(value: local.User) {}');
  assert.equal((await matches(local.declarations[0], local, platform, lookup)).length, 1);
  const wrong = symbols('package local\nactual fun save(value: model.a.User) {}');
  assert.equal((await matches(local.declarations[0], local, wrong, lookup)).length, 0);
});

test('same-package types in another file precede default imports without wildcard imports', async () => {
  const types = symbols('package demo\nclass Result<T>(val value: T)');
  const lookup = lookupFiles([types]);
  const declarations = 'expect fun handle(value: Result<String>)\nexpect fun handle(value: kotlin.Result<String>)';
  const actual = symbols('package demo\nactual fun handle(value: demo.Result<String>) {}\nactual fun handle(value: kotlin.Result<String>) {}');
  // Moving the type declaration into its own file must not change the matched overload.
  for (const typeDeclaration of ['', 'class Result<T>(val value: T)\n']) {
    const common = symbols('package demo\n' + typeDeclaration + declarations);
    const expected = common.declarations.filter(d => d.name === 'handle');
    for (let i = 0; i < expected.length; i++) {
      assert.deepEqual(await matches(expected[i], common, actual, lookup), [actual.declarations[i]]);
      assert.deepEqual(await matches(actual.declarations[i], actual, common, lookup), [expected[i]]);
    }
  }
});

test('default types still match when same-package lookup finds no declaration', async () => {
  const common = symbols('package demo\nexpect fun use(value: Result<List<String>>, items: ArrayList<Int>)');
  const actual = symbols('package demo\nactual fun use(value: kotlin.Result<kotlin.collections.List<kotlin.String>>, items: kotlin.collections.ArrayList<kotlin.Int>) {}');
  const lookup: SymbolLookup = async () => [];
  assert.deepEqual(await matches(common.declarations[0], common, actual, lookup), actual.declarations);
  assert.deepEqual(await matches(actual.declarations[0], actual, common, lookup), common.declarations);
});

test('explicit imports precede file types while enclosing member types retain priority', async () => {
  const common = symbols('package demo\nimport model.a.User\nclass User\nexpect fun use(value: User)');
  const actual = symbols('package demo\nactual fun use(value: model.a.User) {}\nactual fun use(value: demo.User) {}');
  const from = common.declarations.find(d => d.name === 'use')!;
  const targets = await matches(from, common, actual);
  assert.equal(targets.length, 1);
  assert.equal(targets[0], actual.declarations[0]);
  assert.equal((await matches(targets[0], actual, common)).length, 1);
  const nested = symbols('package demo\nimport model.a.User\nexpect class Box { class User; fun use(value: User) }');
  const nestedActual = symbols('package demo\nimport model.a.User\nactual class Box { actual class User; actual fun use(value: demo.Box.User) {} }');
  const member = nested.declarations.find(d => d.name === 'use')!;
  assert.equal((await matches(member, nested, nestedActual)).length, 1);
});

test('actual annotation primary constructors are paired without an explicit actual modifier', async () => {
  const common = 'package demo\nexpect annotation class Tag constructor(val value: String)';
  const platform = 'package demo\nactual annotation class Tag(actual val value: String)';
  const a = symbols(common), b = symbols(platform);
  for (const from of a.declarations) {
    const targets = await matches(from, a, b);
    assert.equal(targets.length, 1, from.path.join('.'));
    assert.ok(await matchesCounterpart(targets[0], b, from, a));
  }
  const constructor = b.declarations.find(d => d.kind === 'CONSTRUCTOR')!;
  assert.equal(constructor.expectActual?.keyword, null);
  assert.equal(platform.slice(constructor.nameStart, constructor.nameEnd), '(');
  assert.equal(counterpartAt(a, common.indexOf('constructor'), false)?.kind, 'CONSTRUCTOR');
  assert.equal(symbols('actual class Ordinary(value: String)').declarations.some(d => d.kind === 'CONSTRUCTOR'), false);
});

test('only declaration names and modifier tokens trigger counterpart lookup', () => {
  const source = '// expect 😀\r\nexpect class Box { fun work() }\r\nfun use() { val actual = "expect"; Box() }';
  const summary = symbols(source);
  for (const d of summary.declarations.filter(d => d.expectActual)) {
    assert.equal(counterpartAt(summary, d.nameStart, false), d);
    assert.equal(counterpartAt(summary, d.nameStart, true), d);
  }
  assert.equal(counterpartAt(summary, source.indexOf('expect class'), false)?.name, 'Box');
  for (const offset of [source.indexOf('expect'), source.indexOf('actual'), source.indexOf('"expect"') + 1, source.lastIndexOf('Box')]) {
    assert.equal(counterpartAt(summary, offset, false), undefined);
  }
  const actual = symbols('actual class Box');
  assert.equal(counterpartAt(actual, 0, true), undefined);
  assert.equal(counterpartAt(actual, 0, false)?.name, 'Box');
});

test('standard KMP source sets retain module and Main/Test boundaries', () => {
  assert.deepEqual(sourceSetLocation('/project/lib/src/iosMain/kotlin/Flat.kt'), { module: '/project/lib', sourceSet: 'iosMain', test: false });
  assert.equal(sourceSetLocation('/project/lib/src/commonTest/kotlin/a/File.kt')?.test, true);
  assert.equal(sourceSetLocation('/project/lib/src/main/kotlin/File.kt'), undefined);
  assert.equal(sourceSetLocation('/project/Flat.kt'), undefined);
});
