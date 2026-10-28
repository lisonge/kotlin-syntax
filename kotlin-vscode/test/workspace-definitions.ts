import type * as VSCode from 'vscode';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { ParserClient } from '../dist/parser-client.js';
import { WorkspaceDefinitions } from '../src/workspace-definitions.ts';
const vscode: typeof VSCode = createRequire(import.meta.url)('vscode');

export async function testWorkspaceDefinitions(root: string) {
  const folder = vscode.Uri.file(root);
  const write = async (path: string, source: string) => {
    const uri = vscode.Uri.joinPath(folder, path);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(source));
    return uri;
  };
  for (const eol of ['\r\n', '\n']) {
    const suffix = eol === '\r\n' ? 'crlf' : 'lf';
    const errorSource = ['package endings.' + suffix + '.error', '', 'interface BusinessError {', '    val errorMessage: String', '}'].join(eol);
    const errorFile = await write(`endings/${suffix}/error/BusinessError.kt`, errorSource);
    const failureSource = [
      'package endings.' + suffix + '.subscription', '', `import endings.${suffix}.error.BusinessError`,
      'class Failure(cause: Throwable?) : IllegalStateException(', '    "failure",', '    cause,', '), BusinessError {',
      '    override val errorMessage: String', '        get() = cause?.let {',
      '            when (it) {', '                is BusinessError -> "business"', '                else -> "other"',
      '            }', '        } ?: ""', '}',
    ].join(eol);
    const failure = await write(`endings/${suffix}/subscription/Failure.kt`, failureSource);
    const doc = await vscode.workspace.openTextDocument(failure);
    for (const fragment of ['), BusinessError', 'is BusinessError']) {
      const offset = doc.getText().indexOf(fragment) + fragment.indexOf('BusinessError');
      const result = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', failure, doc.positionAt(offset));
      assert.equal(result?.length, 1, `${suffix}: ${fragment}`);
      assert.equal(result[0].targetUri.toString(), errorFile.toString(), `${suffix}: ${fragment}`);
      const target = await vscode.workspace.openTextDocument(errorFile);
      assert.equal(target.getText(result[0].targetSelectionRange), 'BusinessError');
    }
  }
  const enumSource = ['package enums', 'class Failure : UnknownBase() {',
    ' val reason get() = Reason.RuleInvalidDetail', ' val other get() = Reason.FormatInvalidDetail',
    ' fun shadow(Reason: Any) = Reason.FormatInvalidDetail', '}',
    'enum class Reason { RuleInvalidDetail, FormatInvalidDetail }'].join('\r\n');
  const enumFile = await write('enums/Failure.kt', enumSource);
  const enumDoc = await vscode.workspace.openTextDocument(enumFile);
  for (const name of ['RuleInvalidDetail', 'FormatInvalidDetail']) {
    for (const selected of ['Reason', name]) {
      const offset = enumSource.indexOf('Reason.' + name) + (selected === 'Reason' ? 0 : 7);
      const links = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', enumFile, enumDoc.positionAt(offset));
      assert.equal(links?.length, 1, `Inherited scope enum ${selected}`);
      assert.equal(links[0].targetUri.toString(), enumFile.toString());
      assert.equal(enumDoc.offsetAt(links[0].targetSelectionRange!.start), enumSource.lastIndexOf(selected));
    }
  }
  const shadowMember = enumSource.indexOf('Reason.FormatInvalidDetail', enumSource.indexOf('fun shadow')) + 7;
  assert.equal((await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', enumFile, enumDoc.positionAt(shadowMember)))?.length, 0);
  const memberModel = await write('navigation/models/Model.kt', `package navigation.models
object Config { val enabled = true; fun read() = 1 }
class Person(val name: String) {
  fun save() = 1
  class Nested
  companion object { val version = 1 }
}
enum class Color { RED, BLUE }
typealias Human = Person`);
  const memberSource = `package navigation.app
import navigation.models.*
val setting = Config.enabled
val method = Config.read()
val nested: Person.Nested? = null
val version = Person.version
val companion = Person.Companion.version
val color = Color.RED
val qualified = navigation.models.Config.enabled
fun use(p: Person, h: Human) { p.name; p.save(); h.name }
fun nullable(p: Person?) = p?.name
fun construct() { val p = Person("a"); p.name; val alias = p; alias.save() }
fun shadow(Config: Any) = Config.enabled
fun factory(Person: () -> Any) { val p = Person(); p.name }
val invalid = Person.name`;
  const memberCaller = await write('navigation/app/Main.kt', memberSource);
  const memberDoc = await vscode.workspace.openTextDocument(memberCaller);
  const modelDoc = await vscode.workspace.openTextDocument(memberModel);
  for (const [fragment, word] of [
    ['Config.enabled', 'enabled'], ['Config.read()', 'read'], ['Person.Nested', 'Nested'],
    ['Person.version', 'version'], ['Person.Companion.version', 'version'], ['Color.RED', 'RED'],
    ['navigation.models.Config.enabled', 'enabled'], ['p.name;', 'name'], ['p.save()', 'save'],
    ['h.name', 'name'], ['p?.name', 'name'], ['p.name; val alias', 'name'], ['alias.save()', 'save'],
  ]) {
    const position = memberSource.indexOf(fragment) + fragment.lastIndexOf(word);
    const result = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', memberCaller, memberDoc.positionAt(position));
    assert.equal(result?.length, 1, `Navigation ${fragment}: ${JSON.stringify(result)}`);
    assert.equal(result[0].targetUri.toString(), memberModel.toString(), fragment);
    assert.equal(modelDoc.getText(result[0].targetSelectionRange), word, fragment);
  }
  for (const fragment of ['Config.enabled', 'p.name', 'Person.name']) {
    const position = memberSource.lastIndexOf(fragment) + fragment.lastIndexOf('.') + 1;
    const result = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', memberCaller, memberDoc.positionAt(position));
    assert.equal(result?.length, 0, `Unsupported receiver ${fragment}`);
  }
  const nestedModel = await write('nested/Model.kt', 'package nested\nclass Box { class Value { fun work() {} }; val value: Value = Value() }');
  const nestedCaller = await write('nested/Caller.kt', 'package nested\nfun use(box: Box) { box.value.work() }');
  const nestedDoc = await vscode.workspace.openTextDocument(nestedCaller);
  for (const unrelated of [false, true]) {
    if (unrelated) await write('nested/Other.kt', 'package nested\nclass Value { fun work() {} }');
    const result = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', nestedCaller,
      nestedDoc.positionAt(nestedDoc.getText().lastIndexOf('work')));
    assert.equal(result?.length, 1, 'Nested receiver survives moving declarations to another file');
    assert.equal(result[0].targetUri.toString(), nestedModel.toString());
    assert.equal((await vscode.workspace.openTextDocument(nestedModel)).getText(result[0].targetSelectionRange), 'work');
  }
  const main = await write('app/src/main/kotlin/com/example/app/Main.kt', 'package com.example.app\nimport com.example.model.User as Account\nfun use(value: Account) = value\n');
  const model = await write('lib/src/main/kotlin/com/example/model/Models.kt', 'package com.example.model\nclass User\n');
  await write('lib/src/main/kotlin/com/example/model/Private.kt', 'package com.example.model\nprivate class User');
  await write('lib/src/main/kotlin/com/example/model/Wrong.kt', 'package wrong\nclass User');
  await write('lib/src/main/kotlin/com/example/model/Comment.kt', 'package com.example.model\n// class User\nval text = "User"');
  await write('lib/src/main/kotlin/com/example/model/Unrelated.kt', 'fun broken(');
  await write('.gitignore', '/.local/\n');
  await write('.local/com/example/model/Hidden.kt', 'package com.example.model\nclass User // IgnoredDirectory');
  await write('lib/src/main/kotlin/com/example/model/Substring.kt', 'package com.example.model\nclass UserAccount\nclass MyUser\nclass User_\nclass User中');
  await write('lib/build/generated/com/example/model/Generated.kt', 'package com.example.model\nclass User // Generated');
  const document = await vscode.workspace.openTextDocument(main);
  await vscode.window.showTextDocument(document);
  const lookup = async () => {
    const result = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', main, document.positionAt(document.getText().lastIndexOf('Account')));
    assert.ok(result);
    return result;
  };
  let links = await lookup();
  assert.equal(links.length, 1);
  assert.equal(links[0].targetUri.toString(), model.toString(), 'Alias resolves to declaration in a differently named file and module');
  let target = await vscode.workspace.openTextDocument(model);
  assert.equal(target.getText(links[0].targetSelectionRange), 'User');
  const probeClient = new ParserClient();
  const parsedSources: string[] = [];
  const originalSymbols = probeClient.symbols.bind(probeClient);
  probeClient.symbols = (snapshot, signal, offset) => {
    if (snapshot.key.startsWith('workspace-symbols:')) parsedSources.push(snapshot.source);
    return originalSymbols(snapshot, signal, offset);
  };
  const reads = new Map<string, number>();
  const probe = new WorkspaceDefinitions(probeClient, {
    stat: uri => vscode.workspace.fs.stat(uri),
    readFile: uri => vscode.workspace.fs.readFile(uri),
    readDirectory: async uri => {
      reads.set(uri.toString(), (reads.get(uri.toString()) ?? 0) + 1);
      return vscode.workspace.fs.readDirectory(uri);
    },
  });
  const cancellation = new vscode.CancellationTokenSource();
  const controller = new AbortController();
  const importStart = document.getText().indexOf('import');
  const importEnd = document.getText().indexOf('\n', importStart);
  const fallback: VSCode.DefinitionLink[] = [{ targetUri: main,
    targetRange: new vscode.Range(document.positionAt(importStart), document.positionAt(importEnd)),
    targetSelectionRange: new vscode.Range(document.positionAt(importEnd - 7), document.positionAt(importEnd)),
  }];
  try {
    await probe.resolve(document, fallback, controller.signal, cancellation.token);
    assert.ok(parsedSources.length > 0);
    assert.ok(parsedSources.every(source => source.includes('User')), 'String filtering runs before candidate parsing');
    assert.ok(!parsedSources.some(source => source.includes('UserAccount')), 'Embedded identifier substrings do not reach the parser');
    assert.ok(!parsedSources.some(source => source.includes('Generated')), 'Build output is excluded');
    assert.ok(!parsedSources.some(source => source.includes('IgnoredDirectory')), 'Gitignored directories never reach parsing');
    const coldCount = parsedSources.length;
    await probe.resolve(document, fallback, controller.signal, cancellation.token);
    assert.equal(parsedSources.length, coldCount, 'Repeated queries reuse candidate summaries without parsing them again');
    reads.clear();
    {
      const offset = memberSource.indexOf('h.name') + 2;
      const resolved = await probe.resolve(memberDoc, [], controller.signal, cancellation.token, offset);
      assert.equal(resolved.length, 1, 'Typealias receiver resolves through multiple symbol lookups');
      assert.equal(resolved[0].targetUri.toString(), memberModel.toString());
      assert.ok(reads.size > 0);
      assert.ok([...reads.values()].every(count => count === 1), 'Each directory is read at most once per navigation request');
    }
    const finalCount = parsedSources.length;
    controller.abort();
    await probe.resolve(document, fallback, controller.signal, cancellation.token);
    assert.equal(parsedSources.length, finalCount, 'Cancelled query starts no candidate parsing');
  } finally { probe.dispose(); cancellation.dispose(); await probeClient.dispose(); }
  const edit = new vscode.WorkspaceEdit();
  edit.insert(model, new vscode.Position(0, 0), '// 😀 unsaved\n');
  assert.ok(await vscode.workspace.applyEdit(edit));
  links = await lookup();
  assert.equal(links[0].targetSelectionRange!.start.line, 2, 'Unsaved target contents invalidate cached offsets');
  const hide = new vscode.WorkspaceEdit();
  hide.replace(model, new vscode.Range(new vscode.Position(0, 0), target.positionAt(target.getText().length)), 'package com.example.model\nprivate class User');
  assert.ok(await vscode.workspace.applyEdit(hide));
  links = await lookup();
  assert.equal(links[0].targetUri.toString(), main.toString(), 'Unresolved import keeps original fallback');
  await target.save();

  const other = await write('lib/src/main/kotlin/com/example/model/Other.kt', 'package com.example.model\nclass User');
  links = await lookup();
  assert.equal(links[0].targetUri.toString(), other.toString(), 'New files are discovered');
  const createdWatcher = vscode.workspace.createFileSystemWatcher('**/*');
  const refreshed = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { createdWatcher.dispose(); reject(new Error('Missing workspace creation event')); }, 5000);
    createdWatcher.onDidCreate(uri => {
      if (!uri.path.includes('/second')) return;
      clearTimeout(timer); createdWatcher.dispose(); resolve();
    });
  });
  const duplicate = await write('second/src/main/kotlin/com/example/model/Other.kt', 'package com.example.model\nclass User');
  await refreshed;
  links = await lookup();
  assert.equal(links.length, 2, 'Duplicate qualified names preserve all candidates');
  await vscode.workspace.fs.delete(duplicate);
  const renamed = vscode.Uri.joinPath(folder, 'lib/src/main/kotlin/com/example/model/Renamed.kt');
  await vscode.workspace.fs.rename(other, renamed);
  links = await lookup();
  assert.equal(links.length, 1);
  assert.equal(links[0].targetUri.toString(), renamed.toString(), 'Deleted and renamed files do not leave cached targets');

  const shortMain = await write('short/src/main/kotlin/app/Main.kt', 'package com.example.app\nimport com.example.model.User\nfun use(value: User) = value');
  const shortModel = await write('short/src/main/kotlin/model/User.kt', 'package com.example.model\nclass User');
  await vscode.workspace.fs.delete(renamed);
  const shortDoc = await vscode.workspace.openTextDocument(shortMain);
  const shortLinks = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', shortMain, shortDoc.positionAt(shortDoc.getText().lastIndexOf('User')));
  assert.equal(shortLinks?.length, 1);
  assert.equal(shortLinks[0].targetUri.toString(), shortModel.toString(), 'Common package prefix omitted from directory layout');

  const overloadFile = await write('short/src/main/kotlin/model/Helpers.kt', 'package com.example.model\nfun make() = 1\nfun make(value: Int) = value\ntypealias Alias = String');
  const caller = await write('short/src/main/kotlin/app/Calls.kt', 'package com.example.app\nimport com.example.model.make\nimport com.example.model.Alias\nval a: Alias = ""\nval b = make()');
  const callerDoc = await vscode.workspace.openTextDocument(caller);
  const overloads = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', caller, callerDoc.positionAt(callerDoc.getText().lastIndexOf('make')));
  assert.equal(overloads?.length, 2, 'Imported overloads remain candidates rather than guessed resolution');
  assert.ok(overloads.every(link => link.targetUri.toString() === overloadFile.toString()));
  const alias = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', caller, callerDoc.positionAt(callerDoc.getText().lastIndexOf('Alias')));
  assert.equal(alias?.length, 1);
  assert.equal(alias[0].targetUri.toString(), overloadFile.toString());

  const sibling = await write('siblings/Models.kt', 'package demo\nclass Neighbor\nfun helper() = 1\nfun String.helper() = 2\nval value = 1\nprivate class Secret\nval OnlyValue = 1');
  await write('siblings/Wrong.kt', 'package other\nclass Neighbor\nclass Secret');
  const noImport = await write('siblings/Main.kt', 'package demo\nval item: Neighbor? = null\nval result = helper()\nval number = value\nval hidden: Secret? = null\nval wrong: OnlyValue? = null\nfun local(helper: Int) = helper\nfun member(obj: Any) = obj.helper()\nval text = "Neighbor"\n// Neighbor');
  const noImportDoc = await vscode.workspace.openTextDocument(noImport);
  const at = async (fragment: string, shift = 0) => {
    const result = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', noImport, noImportDoc.positionAt(noImportDoc.getText().indexOf(fragment) + shift));
    assert.ok(result);
    return result;
  };
  for (const word of ['Neighbor', 'helper()', 'value\n']) {
    const result = await at(word);
    assert.equal(result.length, 1);
    assert.equal(result[0].targetUri.toString(), sibling.toString(), `No-import same-package lookup for ${word}`);
  }
  assert.equal((await at('Secret')).length, 0, 'Private and different-package declarations are excluded');
  assert.equal((await at('OnlyValue')).length, 0, 'Type references do not resolve to properties');
  assert.equal((await at('obj.helper', 4)).length, 0, 'Qualified members are not searched as top-level names');
  assert.equal((await at('"Neighbor"', 1)).length, 0);
  assert.equal((await at('// Neighbor', 3)).length, 0);
  const localLinks = await at('= helper\n', 2);
  assert.equal(localLinks.length, 1);
  assert.equal(localLinks[0].targetUri.toString(), noImport.toString(), 'Local bindings retain priority');
  const defaultTarget = await write('default/Model.kt', 'class DefaultModel');
  const defaultCaller = await write('default/Main.kt', 'val model: DefaultModel? = null');
  const defaultDoc = await vscode.workspace.openTextDocument(defaultCaller);
  const defaultLinks = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', defaultCaller, defaultDoc.positionAt(11));
  assert.equal(defaultLinks?.length, 1);
  assert.equal(defaultLinks[0].targetUri.toString(), defaultTarget.toString(), 'Default package siblings are supported');

  const constructors = await write('siblings/Constructors.kt', 'package demo\nimport com.example.model.User as Account\nval plain = Neighbor()\nval nested = run { Neighbor() }\nval imported = run { Account() }\nval unsupported = run { helper() }\nfun shadow(Neighbor: () -> Int) = run { Neighbor() }');
  const constructorDoc = await vscode.workspace.openTextDocument(constructors);
  for (const fragment of ['= Neighbor()', '{ Neighbor() }', '{ Account() }']) {
    const offset = constructorDoc.getText().indexOf(fragment) + 2;
    const results = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', constructors, constructorDoc.positionAt(offset));
    assert.equal(results?.length, 1, `Constructor candidate ${fragment}`);
    assert.equal(results[0].targetUri.toString(), fragment.includes('Account') ? shortModel.toString() : sibling.toString());
  }
  const helperLinks = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', constructors, constructorDoc.positionAt(constructorDoc.getText().indexOf('{ helper() }') + 2));
  assert.equal(helperLinks?.length, 0, 'Unknown receiver does not expose arbitrary top-level functions');
  const shadowLinks = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', constructors, constructorDoc.positionAt(constructorDoc.getText().lastIndexOf('Neighbor')));
  assert.equal(shadowLinks?.length, 1);
  assert.equal(shadowLinks[0].targetUri.toString(), constructors.toString(), 'Captured callable wins over class with the same name');

  const db = await write('gkd-db/src/commonMain/kotlin/li/gkd/db/Db.kt', 'package li.gkd.db\nobject Db {\n    internal val database by lazy { 1 }\n    private val hidden = 2\n    object Nested { val nestedValue = 3 }\n}\nclass Instance { val database = 4 }');
  await write('gkd-db/src/commonMain/kotlin/li/gkd/db/Other.kt', 'package li.gkd.db\nobject Other { val database = 1 }');
  const store = await write('gkd-db/src/commonMain/kotlin/li/gkd/db/SubscriptionConfigStore.kt', 'package li.gkd.db\nimport li.gkd.db.Db.database\nimport li.gkd.db.Db.database as connection\nimport li.gkd.db.Db.Nested.nestedValue\nimport li.gkd.db.Db.hidden\nimport li.gkd.db.Instance.database as instanceValue\nobject SubscriptionConfigStore {\n    suspend fun setAppEnabled() = database.withWriteTransaction { }\n    val alias = connection\n    val nested = nestedValue\n    val secret = hidden\n    val invalid = instanceValue\n}');
  const storeDoc = await vscode.workspace.openTextDocument(store);
  for (const word of ['database.withWriteTransaction', 'connection\n', 'nestedValue\n', 'hidden\n', 'instanceValue\n']) {
    const result = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', store, storeDoc.positionAt(storeDoc.getText().lastIndexOf(word)));
    assert.equal(result?.length, 1);
    const fallback = word === 'hidden\n' || word === 'instanceValue\n';
    assert.equal(result[0].targetUri.toString(), (fallback ? store : db).toString(), `Object-member import: ${word}`);
    if (!fallback) {
      const dbDoc = await vscode.workspace.openTextDocument(db);
      assert.equal(dbDoc.getText(result[0].targetSelectionRange), word === 'nestedValue\n' ? 'nestedValue' : 'database');
    }
  }

  const jsonFile = await write('gkd-app/src/commonMain/kotlin/li/gkd/app/subscription/SubscriptionJson.kt', 'package li.gkd.app.subscription\nobject SubscriptionJson {\n    val json = 1\n    inline fun <reified T> toJson5String(value: T): String = ""\n}');
  const rawFile = await write('gkd-app/src/commonMain/kotlin/li/gkd/app/subscription/RawSubscription.kt', 'package li.gkd.app.subscription\nimport li.gkd.app.subscription.SubscriptionJson.json\nimport li.gkd.app.subscription.SubscriptionJson.toJson5String\nimport li.gkd.app.subscription.SubscriptionJson.toJson5String as serialize\nclass RawSubscription : UnknownBase {\n    val cacheStr by lazy { toJson5String(this) }\n    val cacheObject by lazy { json.encode(this) }\n    val alias by lazy { serialize(this) }\n}');
  const rawDoc = await vscode.workspace.openTextDocument(rawFile);
  const jsonDoc = await vscode.workspace.openTextDocument(jsonFile);
  for (const [fragment, expected] of [
    ['SubscriptionJson.json', 'SubscriptionJson'],
    ['SubscriptionJson.toJson5String', 'SubscriptionJson'],
    ['json\n', 'json'], ['toJson5String\n', 'toJson5String'], ['serialize\n', 'toJson5String'],
    ['toJson5String(this)', 'toJson5String'], ['json.encode', 'json'], ['serialize(this)', 'toJson5String'],
  ]) {
    const result = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', rawFile, rawDoc.positionAt(rawDoc.getText().indexOf(fragment)));
    assert.equal(result?.length, 1, fragment);
    assert.equal(result[0].targetUri.toString(), jsonFile.toString(), fragment);
    assert.equal(jsonDoc.getText(result[0].targetSelectionRange), expected, fragment);
  }
  const snapshotStore = await write('snapshot/Store.kt', 'package snapshot\nobject SnapshotStore { fun createArchive() = 1; fun deleteArchive(value: Int) {} }');
  const exportsFile = await write('exports/FileExports.kt', 'package exports\nobject FileExports { fun withTemporaryFile(create: () -> Int, delete: (Int) -> Unit, consume: (Int) -> Unit) {} }\nfun saveToDownloads(value: Int) {}');
  const captureSource = 'package snapshot\nimport exports.FileExports\nimport exports.saveToDownloads\nfun capture() = FileExports.withTemporaryFile(create = { SnapshotStore.createArchive() }, delete = SnapshotStore::deleteArchive, consume = ::saveToDownloads)';
  const captureFile = await write('snapshot/Capture.kt', captureSource);
  const captureDoc = await vscode.workspace.openTextDocument(captureFile);
  for (const [fragment, expected, destination] of [
    ['SnapshotStore.createArchive', 'SnapshotStore', snapshotStore],
    ['createArchive()', 'createArchive', snapshotStore],
    ['deleteArchive,', 'deleteArchive', snapshotStore],
    ['saveToDownloads)', 'saveToDownloads', exportsFile],
    ['create =', 'create', exportsFile], ['delete =', 'delete', exportsFile], ['consume =', 'consume', exportsFile],
  ] as const) {
    const result = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', captureFile, captureDoc.positionAt(captureSource.indexOf(fragment)));
    assert.equal(result?.length, 1, fragment);
    assert.equal(result[0].targetUri.toString(), destination.toString(), fragment);
    assert.equal((await vscode.workspace.openTextDocument(destination)).getText(result[0].targetSelectionRange), expected, fragment);
  }
  const lockedSource = 'package snapshot\nobject LockedStore { fun createUploadArchive() = mutationMutex.withLock { Result(file = createArchiveLocked(1)) }; private fun createArchiveLocked(id: Int) = id }';
  const lockedFile = await write('snapshot/LockedStore.kt', lockedSource);
  const lockedDoc = await vscode.workspace.openTextDocument(lockedFile);
  const lockedLinks = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', lockedFile, lockedDoc.positionAt(lockedSource.indexOf('createArchiveLocked')));
  assert.equal(lockedLinks?.length, 1);
  assert.equal(lockedLinks[0].targetUri.toString(), lockedFile.toString());
  assert.ok(lockedLinks[0].targetSelectionRange);
  assert.equal(lockedDoc.offsetAt(lockedLinks[0].targetSelectionRange.start), lockedSource.lastIndexOf('createArchiveLocked'));
  const auditModel = await write('audit/Models.kt', 'package audit\nclass User(val name: String) { fun save() {}; private fun secret() {} }\ntypealias Account = User');
  const auditSource = 'package audit\nval reference = User::save\nval account = Account(name = "a")\nfun blocked(user: User) = user.secret()\nfun local() { class User { fun save() {} }; val user = User(); user.save() }\nfun overloaded(x: Int) {}\nfun overloaded(x: String) {}\nval result = overloaded(x = 1)';
  const auditFile = await write('audit/Use.kt', auditSource);
  const auditDoc = await vscode.workspace.openTextDocument(auditFile);
  const auditAt = async (fragment: string, shift = 0) => (await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', auditFile, auditDoc.positionAt(auditSource.indexOf(fragment) + shift))) ?? [];
  for (const [fragment, shift, expected] of [['User::save', 6, 'save'], ['name =', 0, 'name']] as const) {
    const result = await auditAt(fragment, shift);
    assert.equal(result.length, 1, fragment);
    assert.equal(result[0].targetUri.toString(), auditModel.toString());
    assert.equal((await vscode.workspace.openTextDocument(auditModel)).getText(result[0].targetSelectionRange), expected);
  }
  assert.equal((await auditAt('user.secret', 5)).length, 0);
  const localMember = await auditAt('user.save', 5);
  assert.equal(localMember.length, 1);
  assert.equal(localMember[0].targetUri.toString(), auditFile.toString());
  assert.equal(auditDoc.getText(localMember[0].targetSelectionRange), 'save');
  assert.equal((await auditAt('x =')).length, 2, 'Named arguments preserve overload candidates');
  const privacySource = 'package audit\nclass PrivateOwner { private fun hidden() {} }; fun f(p: PrivateOwner) = p.hidden()';
  const privacyFile = await write('audit/Privacy.kt', privacySource);
  const privacyDoc = await vscode.workspace.openTextDocument(privacyFile);
  const privacyLinks = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', privacyFile, privacyDoc.positionAt(privacySource.lastIndexOf('hidden')));
  assert.equal(privacyLinks?.length, 0, 'Same file does not grant access to another class private member');
  const appSource = 'package app\nval appScope by lazy { MainScope() }\nclass App : Application() { fun install() { Thread.setDefaultUncaughtExceptionHandler { t, e -> appScope.launchLogged() } } }';
  const appFile = await write('app/App.kt', appSource);
  const appDoc = await vscode.workspace.openTextDocument(appFile);
  const scopeLinks = await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', appFile, appDoc.positionAt(appSource.lastIndexOf('appScope')));
  assert.equal(scopeLinks?.length, 1);
  assert.equal(scopeLinks[0].targetUri.toString(), appFile.toString());
  assert.ok(scopeLinks[0].targetSelectionRange);
  assert.equal(appDoc.offsetAt(scopeLinks[0].targetSelectionRange.start), appSource.indexOf('appScope'));
}
