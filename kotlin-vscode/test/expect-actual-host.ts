import type * as VSCode from 'vscode';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { ParserClient } from '../dist/parser-client.js';
import { WorkspaceDefinitions } from '../src/workspace-definitions.ts';
const vscode: typeof VSCode = createRequire(import.meta.url)('vscode');

export async function testExpectActual(root: string) {
  const folder = vscode.Uri.file(root);
  async function write(path: string, source: string) {
    const uri = vscode.Uri.joinPath(folder, 'expect-actual', path);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(source));
    return uri;
  }
  const commonSource = '// 😀\r\npackage demo\r\nexpect fun String.work(value: Int): String\r\nexpect class Box { fun read(): Int }\r\nexpect class Date\r\nfun normal(value: Int) = value\r\n';
  const common = await write('lib/src/commonMain/kotlin/Api.kt', commonSource);
  const jvm = await write('lib/src/jvmMain/kotlin/arbitrary/path/Impl.kt', 'package demo\nactual fun String.work(value: Int) = this\nactual fun String.work(value: String) = this\nactual class Box { actual fun read() = 1 }\nactual typealias Date = java.time.LocalDate');
  const ios = await write('lib/src/iosMain/kotlin/Flat.kt', 'package demo\nactual fun String.work(value: Int) = this\nactual class Box { actual fun read() = 2 }');
  await write('lib/src/jvmTest/kotlin/Test.kt', 'package demo\nactual fun String.work(value: Int) = this');
  await write('other/src/jvmMain/kotlin/Other.kt', 'package demo\nactual fun String.work(value: Int) = this');
  await write('lib/src/commonMain/kotlin/Ordinary.kt', 'package demo\nfun String.work(value: Int) = this');
  await write('lib/src/jvmMain/kotlin/WrongPackage.kt', 'package wrong\nactual fun String.work(value: Int) = this');
  await write('lib/src/jvmMain/kotlin/ignored/.gitignore', '*.kt');
  await write('lib/src/jvmMain/kotlin/ignored/Hidden.kt', 'package demo\nactual fun String.work(value: Int) = this');
  await write('lib/build/src/jvmMain/kotlin/Generated.kt', 'package demo\nactual fun String.work(value: Int) = this');
  const document = await vscode.workspace.openTextDocument(common);
  const jvmDoc = await vscode.workspace.openTextDocument(jvm);
  const iosDoc = await vscode.workspace.openTextDocument(ios);
  async function navigate(doc: VSCode.TextDocument, fragment: string, shift = 0, implementation = false) {
    const offset = doc.getText().indexOf(fragment) + shift;
    assert.ok(offset >= 0, fragment);
    return await vscode.commands.executeCommand<VSCode.LocationLink[]>(implementation ? 'vscode.executeImplementationProvider' : 'vscode.executeDefinitionProvider', doc.uri, doc.positionAt(offset)) ?? [];
  }
  let links = await navigate(document, 'expect fun');
  assert.deepEqual(links.map(l => l.targetUri.toString()).sort(), [jvm, ios].map(u => u.toString()).sort(), 'All platforms, correct overload, flat and non-package layouts, no other modules/tests/generated sources');
  for (const link of links) {
    assert.equal(document.getText(link.originSelectionRange), 'expect');
    const target = await vscode.workspace.openTextDocument(link.targetUri);
    assert.equal(target.getText(link.targetSelectionRange), 'work');
  }
  assert.equal((await navigate(jvmDoc, 'actual fun'))[0]?.targetUri.toString(), common.toString());
  assert.equal((await navigate(document, 'work', 0, true)).length, 2, 'Go to Implementation on declaration name');
  assert.equal((await navigate(document, 'read', 0, true)).length, 2, 'Implicit expect member');
  assert.equal((await navigate(jvmDoc, 'actual fun read'))[0]?.targetUri.toString(), common.toString());
  assert.equal((await navigate(document, 'expect class Date'))[0]?.targetUri.toString(), jvm.toString());
  assert.equal((await navigate(jvmDoc, 'actual typealias'))[0]?.targetUri.toString(), common.toString());
  assert.equal((await navigate(document, 'normal', 0, true)).length, 0, 'Ordinary declarations do not acquire an implementation search');
  assert.equal((await navigate(document, '// 😀', 3)).length, 0);

  const typesCommon = await write('identities/src/commonMain/kotlin/Types.kt', `package identities
import api.*
class Outer { class Inner }
expect fun defaults(value: ArrayList<String>)
expect fun defaults(value: List<String>)
expect fun wildcard(value: User)
expect fun nested(value: Outer.Inner)
expect annotation class Tag constructor(val value: String)`);
  await write('identities/src/commonMain/kotlin/User.kt', 'package api\nclass User');
  const typesActual = await write('identities/src/jvmMain/kotlin/Types.kt', `package identities
import kotlin.collections.ArrayList
import api.User
import identities.Outer.Inner as Nested
actual fun defaults(value: ArrayList<String>) {}
actual fun defaults(value: List<String>) {}
actual fun wildcard(value: User) {}
actual fun nested(value: Nested) {}
actual annotation class Tag constructor(actual val value: String)`);
  const typesDoc = await vscode.workspace.openTextDocument(typesCommon);
  const actualTypesDoc = await vscode.workspace.openTextDocument(typesActual);
  for (const fragment of ['fun defaults(value: ArrayList', 'fun defaults(value: List', 'fun wildcard', 'fun nested']) {
    const forward = await navigate(typesDoc, 'expect ' + fragment);
    assert.equal(forward.length, 1, 'Equivalent type spellings and overloads: ' + fragment);
    assert.equal(forward[0].targetUri.toString(), typesActual.toString());
    const actualText = actualTypesDoc.getText(forward[0].targetRange);
    assert.ok(actualText.includes(fragment), actualText);
    const backward = await navigate(actualTypesDoc, 'actual ' + fragment);
    assert.equal(backward.length, 1, 'Reverse equivalent-type navigation: ' + fragment);
    assert.equal(backward[0].targetUri.toString(), typesCommon.toString());
  }
  for (const implementation of [false, true]) {
    const constructor = await navigate(typesDoc, 'constructor', 0, implementation);
    assert.equal(constructor.length, 1, 'Annotation constructor without explicit actual: ' + implementation);
    assert.equal(constructor[0].targetUri.toString(), typesActual.toString());
    assert.equal(actualTypesDoc.getText(constructor[0].targetSelectionRange), 'constructor');
  }
  const annotationBack = await navigate(actualTypesDoc, 'constructor');
  assert.equal(annotationBack.length, 1);
  assert.equal(typesDoc.getText(annotationBack[0].targetSelectionRange), 'constructor');

  // These overloads compile together; each wildcard import selects a different User type.
  for (const name of ['a', 'b']) await write(`imports/src/commonMain/kotlin/Model${name}.kt`, `package model.${name}\nclass User`);
  const overloadPairs: [VSCode.TextDocument, VSCode.TextDocument][] = [];
  for (const name of ['a', 'b']) {
    const expected = await write(`imports/src/commonMain/kotlin/Common${name}.kt`, `package stars\nimport model.${name}.*\nexpect fun User.save(value: List<User>, count: Int)`);
    const implementation = await write(`imports/src/jvmMain/kotlin/Actual${name}.kt`, `package stars\nimport model.${name}.*\nactual fun User.save(value: List<User>, count: Int) {}`);
    overloadPairs.push([await vscode.workspace.openTextDocument(expected), await vscode.workspace.openTextDocument(implementation)]);
  }
  const imported = await write('imports/src/commonMain/kotlin/Import.kt', 'package explicit\nimport model.a.User\nclass User\nexpect fun use(value: User)');
  const importedActual = await write('imports/src/jvmMain/kotlin/Import.kt', 'package explicit\nactual fun use(value: model.a.User) {}');
  overloadPairs.push([await vscode.workspace.openTextDocument(imported), await vscode.workspace.openTextDocument(importedActual)]);
  await write('imports/src/commonMain/kotlin/LocalUser.kt', 'package local\nclass User');
  const local = await write('imports/src/commonMain/kotlin/Local.kt', 'package local\nimport model.a.*\nexpect fun local(value: User)');
  const localActual = await write('imports/src/jvmMain/kotlin/Local.kt', 'package local\nactual fun local(value: local.User) {}');
  overloadPairs.push([await vscode.workspace.openTextDocument(local), await vscode.workspace.openTextDocument(localActual)]);
  for (const [expected, implementation] of overloadPairs) {
    for (const goToImplementation of [false, true]) {
      const forward = await navigate(expected, 'expect', 0, goToImplementation);
      assert.deepEqual(forward.map(link => link.targetUri.toString()), [implementation.uri.toString()], 'Import identity must select exactly one implementation');
    }
    const backward = await navigate(implementation, 'actual');
    assert.deepEqual(backward.map(link => link.targetUri.toString()), [expected.uri.toString()], 'Import identity must select exactly one expectation');
  }

  await write('package-types/src/commonMain/kotlin/Result.kt', 'package demo\nclass Result<T>(val value: T)');
  const resultCommon = await write('package-types/src/commonMain/kotlin/Common.kt', `package demo
expect fun handle(value: Result<String>)
expect fun handle(value: kotlin.Result<String>)
expect fun defaults(value: List<String>)`);
  const resultActual = await write('package-types/src/jvmMain/kotlin/Platform.kt', `package demo
actual fun handle(value: demo.Result<String>) {}
actual fun handle(value: kotlin.Result<String>) {}
actual fun defaults(value: kotlin.collections.List<String>) {}`);
  const resultCommonDoc = await vscode.workspace.openTextDocument(resultCommon);
  const resultActualDoc = await vscode.workspace.openTextDocument(resultActual);
  for (const [expected, implementation] of [
    ['handle(value: Result<String>)', 'handle(value: demo.Result<String>)'],
    ['handle(value: kotlin.Result<String>)', 'handle(value: kotlin.Result<String>)'],
    ['defaults(value: List<String>)', 'defaults(value: kotlin.collections.List<String>)'],
  ]) {
    for (const goToImplementation of [false, true]) {
      const forward = await navigate(resultCommonDoc, expected, 0, goToImplementation);
      assert.equal(forward.length, 1, 'Same-package and default types must select different overloads: ' + expected);
      assert.equal(forward[0].targetUri.toString(), resultActual.toString());
      assert.ok(resultActualDoc.getText(forward[0].targetRange).includes(implementation));
    }
    const backward = await navigate(resultActualDoc, implementation);
    assert.equal(backward.length, 1, 'Reverse same-package/default type navigation: ' + implementation);
    assert.equal(backward[0].targetUri.toString(), resultCommon.toString());
    assert.ok(resultCommonDoc.getText(backward[0].targetRange).includes(expected));
  }

  const qualifiedCommon = await write('qualified/src/commonMain/kotlin/Common.kt', `package qualified
class Outer<T> { inner class Inner }
class First
class Second
expect fun nested(value: Outer<String>.Inner)
context(first: First) expect fun load()
context(second: Second) expect fun load()`);
  const qualifiedActual = await write('qualified/src/jvmMain/kotlin/Actual.kt', `package qualified
import qualified.Outer as Container
actual fun nested(value: Container<kotlin.String>.Inner) {}
actual fun nested(value: Container<kotlin.Int>.Inner) {}
context(renamed: First) actual fun load() {}
context(_: Second) actual fun load() {}`);
  const qualifiedDoc = await vscode.workspace.openTextDocument(qualifiedCommon);
  const qualifiedActualDoc = await vscode.workspace.openTextDocument(qualifiedActual);
  for (const [expected, actual] of [
    ['expect fun nested', 'actual fun nested(value: Container<kotlin.String>.Inner)'],
    ['context(first: First) expect fun load', 'context(renamed: First) actual fun load'],
    ['context(second: Second) expect fun load', 'context(_: Second) actual fun load'],
  ]) {
    for (const implementation of [false, true]) {
      const forward = await navigate(qualifiedDoc, expected, expected.indexOf('expect'), implementation);
      assert.equal(forward.length, 1, expected);
      assert.equal(forward[0].targetUri.toString(), qualifiedActual.toString());
      assert.ok(qualifiedActualDoc.getText(forward[0].targetRange).includes(actual));
    }
    const backward = await navigate(qualifiedActualDoc, actual, actual.indexOf('actual'));
    assert.equal(backward.length, 1, actual);
    assert.equal(backward[0].targetUri.toString(), qualifiedCommon.toString());
    assert.ok(qualifiedDoc.getText(backward[0].targetRange).includes(expected));
  }

  const client = new ParserClient();
  let reads = 0, summaries = 0;
  const summariesByFile = new Map<string, number>();
  const symbols = client.symbols.bind(client);
  client.symbols = (snapshot, signal, offset) => {
    if (snapshot.key.startsWith('workspace-symbols:')) {
      summaries++;
      const file = snapshot.key.replace(/^workspace-symbols:\d+:/, '');
      summariesByFile.set(file, (summariesByFile.get(file) ?? 0) + 1);
    }
    return symbols(snapshot, signal, offset);
  };
  const probe = new WorkspaceDefinitions(client, {
    stat: uri => vscode.workspace.fs.stat(uri),
    readDirectory: uri => { reads++; return vscode.workspace.fs.readDirectory(uri); },
    readFile: uri => { reads++; return vscode.workspace.fs.readFile(uri); },
  });
  const cancellation = new vscode.CancellationTokenSource();
  const controller = new AbortController();
  try {
    await client.request({ key: common.toString(), version: document.version, source: document.getText(), script: false });
    assert.equal(reads, 0, 'Opening/highlighting performs no workspace filesystem reads');
    const offset = document.getText().indexOf('expect fun');
    await probe.resolve(document, [], controller.signal, cancellation.token, offset);
    assert.ok(reads > 0 && summaries > 0, 'Navigation performs on-demand search');
    const parsed = summaries;
    await probe.resolve(document, [], controller.signal, cancellation.token, offset);
    assert.equal(summaries, parsed, 'Candidate summaries are reused');
    const edit = new vscode.WorkspaceEdit();
    edit.insert(ios, new vscode.Position(0, 0), '// unsaved 😀\n');
    assert.ok(await vscode.workspace.applyEdit(edit));
    const updated = await probe.resolve(document, [], controller.signal, cancellation.token, offset);
    const moved = updated.find(l => l.targetUri.toString() === ios.toString());
    assert.equal(moved?.targetSelectionRange?.start.line, 2, 'Unsaved targets invalidate signature/range cache');
    assert.equal(summaries, parsed + 1, 'Only changed candidate is reparsed');
    for (let i = 0; i < 68; i++) await write(`many/src/commonMain/kotlin/Model${i}.kt`, `package many\nclass Model${i}(val name: String, val count: Int)`);
    const many = await write('many/src/commonMain/kotlin/Common.kt', 'package many\nexpect fun sync(name: String, count: Int)');
    const manyActual = await write('many/src/jvmMain/kotlin/Actual.kt', 'package many\nactual fun sync(name: kotlin.String, count: kotlin.Int) {}');
    const manyDoc = await vscode.workspace.openTextDocument(many);
    probe.clear(); summariesByFile.clear();
    const manyLinks = await probe.resolve(manyDoc, [], controller.signal, cancellation.token, manyDoc.getText().indexOf('expect'));
    assert.deepEqual(manyLinks.map(link => link.targetUri.toString()), [manyActual.toString()]);
    assert.equal(summariesByFile.size, 69, 'The request exceeds the persistent summary cache capacity');
    assert.ok([...summariesByFile.values()].every(count => count === 1), 'Each candidate is parsed at most once within a request');
    controller.abort();
    const before = reads;
    assert.deepEqual(await probe.resolve(document, [], controller.signal, cancellation.token, offset), []);
    assert.equal(reads, before, 'Cancelled request performs no search');
  } finally { probe.dispose(); cancellation.dispose(); await client.dispose(); }

  const ambiguous = await write('ambiguous/src/commonMain/kotlin/Common.kt', 'package ambiguous\nimport first.*\nimport second.*\nexpect fun use(value: Value)');
  await write('ambiguous/src/commonMain/kotlin/First.kt', 'package first\nclass Value');
  await write('ambiguous/src/commonMain/kotlin/Second.kt', 'package second\nclass Value');
  await write('ambiguous/src/jvmMain/kotlin/Actual.kt', 'package ambiguous\nimport first.*\nimport second.*\nactual fun use(value: Value) {}');
  assert.deepEqual(await navigate(await vscode.workspace.openTextDocument(ambiguous), 'expect'), [], 'Ambiguous signatures do not produce guessed matches');
  const unknown = await write('unknown/src/commonMain/kotlin/Common.kt', 'package unknown\nexpect fun use(value: Missing)');
  await write('unknown/src/jvmMain/kotlin/Actual.kt', 'package unknown\nactual fun use(value: kotlin.Missing) {}');
  assert.deepEqual(await navigate(await vscode.workspace.openTextDocument(unknown), 'expect'), [], 'Unknown names do not become fabricated stdlib identities');

  // Existing candidate directories are enumerated again; deletion/rename cannot leave stale destinations.
  await iosDoc.save();
  await vscode.workspace.fs.delete(ios);
  links = await navigate(document, 'expect fun');
  assert.deepEqual(links.map(l => l.targetUri.toString()), [jvm.toString()]);
  const plain = await write('Flat.kt', 'expect fun work(): String');
  assert.equal((await navigate(await vscode.workspace.openTextDocument(plain), 'expect')).length, 0, 'Unsupported source layout stays unresolved');
}
