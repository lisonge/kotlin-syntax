import type * as VSCode from 'vscode';
import { createRequire } from 'node:module';
const vscode: typeof VSCode = createRequire(import.meta.url)('vscode');
import assert from 'node:assert/strict';
import { cases, typing } from './highlight-cases.ts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { testWorkspaceDefinitions } from './workspace-definitions.ts';
export async function run() {
  const manifest = JSON.parse(await fs.readFile(process.env.VSCODE_TEST_MANIFEST ?? path.join(import.meta.dirname, '../package.json'), 'utf8'));
  const extension = vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`);
  assert.ok(extension, 'Extension discovered');
  const stable = vscode.extensions.getExtension('lisonge.kotlin-vscode');
  const expectPaused = process.env.VSCODE_TEST_STABLE_PRESENT === '1' && process.env.VSCODE_TEST_STABLE_DISABLED !== '1';
  if (expectPaused) {
    assert.equal(extension.id, 'lisonge.kotlin-vscode-dev');
    assert.ok(stable, 'Enabled stable extension discovered');
    assert.equal(stable.isActive, false, 'Stable need not have activated');
  }
  if (process.env.VSCODE_TEST_STABLE_DISABLED === '1') assert.equal(stable, undefined, 'Disabled stable extension does not block Dev');
  if (process.env.VSCODE_EXPECT_INSTALLED) {
    assert.equal(path.dirname(extension.extensionPath), process.env.VSCODE_EXPECT_EXTENSIONS_DIR, 'Testing the installed copy, not the workspace');
    assert.equal(extension.packageJSON.main, './dist/extension.js');
    assert.equal(extension.packageJSON.version, JSON.parse(await fs.readFile(process.env.VSCODE_TEST_MANIFEST ?? path.join(import.meta.dirname, '../package.json'), 'utf8')).version);
  }
  await extension.activate();
  assert.ok(extension.isActive, 'Extension activated');
  const source = 'package demo\nclass A {}\nclass B {}\n/** comment\n * next */\n@A(types = [String::class])\nfun greet(name: String): String = """hello\nworld"""\nval count = 42\n';
  const document = await vscode.workspace.openTextDocument({ language: 'kotlin', content: source });
  await vscode.window.showTextDocument(document);
  if (expectPaused) {
    const tokens = await vscode.commands.executeCommand<VSCode.SemanticTokens>('vscode.provideDocumentSemanticTokens', document.uri);
    assert.ok(!tokens || tokens.data.length === 0, 'Paused Dev registers no highlighting provider');
    const definitions = await vscode.commands.executeCommand<unknown[]>('vscode.executeDefinitionProvider', document.uri, new vscode.Position(6, 25));
    assert.ok(!definitions || definitions.length === 0, 'Paused Dev registers no definition provider');
    await assert.rejects(async () => await vscode.commands.executeCommand('kotlinSyntaxDev.restartParser'), /not found/, 'Paused Dev registers no parser commands');
    assert.equal(stable!.isActive, false, 'Dev does not activate stable');
    await fs.writeFile(path.join(import.meta.dirname, '../build/host-result.json'), JSON.stringify({ passed: true, assertions: ['Dev yields to enabled but inactive stable', 'no Dev providers or parser commands'] }));
    return;
  }
  const legend = await vscode.commands.executeCommand<VSCode.SemanticTokensLegend>('vscode.provideDocumentSemanticTokensLegend', document.uri);
  assert.ok(legend);
  assert.ok(legend.tokenTypes.includes('function'));
  async function tokens(doc: VSCode.TextDocument): Promise<{ text: string; type: string; modifiers: number }[]> {
    let result: VSCode.SemanticTokens | undefined;
    // An editor refresh may supersede the command request for the same document.
    for (let attempt = 0; attempt < 20 && !result; attempt++) {
      result = await vscode.commands.executeCommand<VSCode.SemanticTokens>('vscode.provideDocumentSemanticTokens', doc.uri);
      if (!result) await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(result && result.data.length > 0, 'Tokens returned');
    let line = 0, char = 0;
    const decoded = [];
    for (let i = 0; i < result.data.length; i += 5) {
      const [dl, dc, length, type, modifiers]: Uint32Array = result.data.slice(i, i + 5);
      char = dl === 0 ? char + dc : dc; line += dl;
      assert.ok(length > 0 && char + length <= doc.lineAt(line).text.length, 'Valid single-line token');
      decoded.push({ text: doc.lineAt(line).text.slice(char, char + length), type: legend.tokenTypes[type], modifiers });
    }
    return decoded;
  }
  await vscode.commands.executeCommand(manifest.contributes.commands.find((entry: { command: string }) => entry.command.endsWith('.showLogs')).command);
  await vscode.commands.executeCommand(manifest.contributes.commands.find((entry: { command: string }) => entry.command.endsWith('.restartParser')).command);
  const before = await tokens(document);
  for (const [text, type] of [['class', 'keyword'], ['greet', 'function'], ['name', 'parameter'], ['42', 'number'], ['String', 'type']])
    assert.ok(before.some(t => t.text === text && t.type === type), `${text} classified as ${type}`);
  assert.ok(before.some(t => t.type === 'comment'));
  assert.ok(before.some(t => t.type === 'string' && t.text.includes('world')));
  const edit = new vscode.WorkspaceEdit();
  const offset = document.getText().indexOf('42');
  edit.replace(document.uri, new vscode.Range(document.positionAt(offset), document.positionAt(offset + 2)), '12345');
  assert.ok(await vscode.workspace.applyEdit(edit));
  const after = await tokens(document);
  assert.ok(after.some(t => t.text === '12345' && t.type === 'number'));
  assert.ok(!after.some(t => t.text === '42'));
  const multi = new vscode.WorkspaceEdit();
  const nameOffset = document.getText().indexOf('greet');
  multi.replace(document.uri, new vscode.Range(document.positionAt(nameOffset), document.positionAt(nameOffset + 5)), 'hello');
  multi.insert(document.uri, document.positionAt(document.getText().length), 'val emoji = "😀"\n');
  assert.ok(await vscode.workspace.applyEdit(multi));
  assert.ok((await tokens(document)).some(t => t.text === 'hello' && t.type === 'function'));
  for (let i = 0; i < 8; i++) {
    const append = new vscode.WorkspaceEdit();
    append.insert(document.uri, document.positionAt(document.getText().length), `val burst${i} = ${i}\n`);
    assert.ok(await vscode.workspace.applyEdit(append));
  }
  assert.ok((await tokens(document)).some(t => t.text === 'burst7'));
  const scriptPath = path.join(import.meta.dirname, '../build/host-sample.kts');
  await fs.mkdir(path.dirname(scriptPath), { recursive: true });
  await fs.writeFile(scriptPath, 'val f = { x: Int -> x + 1 }\nprintln(f(2))\n');
  const script = await vscode.workspace.openTextDocument(scriptPath);
  assert.equal(script.languageId, 'kotlin');
  assert.ok((await tokens(script)).some(t => t.text === 'println' && t.type === 'function'));
  await vscode.window.showTextDocument(script);
  const external = 'val externalValue = "😀"\nprintln(externalValue)\n';
  const reloaded = new Promise<void>((resolve,reject) => {
    const timer = setTimeout(() => { subscription.dispose(); reject(new Error('External file reload timed out')); }, 10_000);
    const subscription = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.toString() === script.uri.toString() && event.document.getText() === external) {
        clearTimeout(timer); subscription.dispose(); resolve();
      }
    });
  });
  await fs.writeFile(scriptPath,external);
  // Explicitly reload the disk file; the isolated host has no workspace file watcher.
  await vscode.commands.executeCommand('workbench.action.files.revert');
  await reloaded;
  assert.ok((await tokens(script)).some(t=>t.text==='externalValue' && t.type==='property'));
  await vscode.commands.executeCommand(manifest.contributes.commands.find((entry: { command: string }) => entry.command.endsWith('.restartParser')).command);
  assert.ok((await tokens(script)).some(t=>t.text==='externalValue' && t.type==='property'));
  for (const doc of [document, script]) {
    for (const fixture of [...cases, ...typing.map(source => ({source, expected: [['x','property',source.startsWith('val')?3:1]] as [string,string,number][]}))]) {
      const change = new vscode.WorkspaceEdit();
      change.replace(doc.uri, new vscode.Range(doc.positionAt(0),doc.positionAt(doc.getText().length)), fixture.source);
      assert.ok(await vscode.workspace.applyEdit(change));
      const actual = await tokens(doc);
      for (const [text,type,modifiers] of fixture.expected) {
        assert.ok(actual.some(t=>t.text===text && t.type===type && t.modifiers===modifiers), `${doc.uri}: ${fixture.source}: ${text}/${type}/${modifiers}`);
      }
    }
  }
  for (const doc of [document, script]) {
    const source = 'import example.User as Account\r\nfun greet(name: String) { val face = "😀"; println(name) }\r\nval user: Account? = null\r\nval member = 1\r\nval unknown = obj.member';
    const replace = new vscode.WorkspaceEdit();
    replace.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), source);
    assert.ok(await vscode.workspace.applyEdit(replace));
    async function definitions(word: string, atEnd = false) {
      return await vscode.commands.executeCommand<VSCode.LocationLink[]>('vscode.executeDefinitionProvider', doc.uri, doc.positionAt(doc.getText().lastIndexOf(word) + (atEnd ? word.length : 0)));
    }
    for (const word of ['name', 'Account']) {
      const [links] = await Promise.all([definitions(word), tokens(doc)]);
      assert.ok(links && links.length === 1, `Definition for ${word}`);
      assert.ok(links[0].targetSelectionRange);
      assert.equal(links[0].targetUri.toString(), doc.uri.toString());
      assert.equal(doc.offsetAt(links[0].targetSelectionRange.start), doc.getText().indexOf(word));
      assert.equal(doc.getText(links[0].targetSelectionRange), word);
      assert.ok(links[0].targetRange.contains(links[0].targetSelectionRange));
    }
    assert.deepEqual(await definitions('member'), []);
    const insert = new vscode.WorkspaceEdit();
    insert.insert(doc.uri, doc.positionAt(0), '// shifted 😀\r\n');
    assert.ok(await vscode.workspace.applyEdit(insert));
    const moved = await definitions('name', true);
    assert.ok(moved && moved.length === 1);
    assert.ok(moved[0].targetSelectionRange);
    assert.equal(doc.offsetAt(moved[0].targetSelectionRange.start), doc.getText().indexOf('name'));
    await vscode.commands.executeCommand(manifest.contributes.commands.find((entry: { command: string }) => entry.command.endsWith('.restartParser')).command);
    const restarted = await definitions('Account');
    assert.ok(restarted && restarted.length === 1);
    assert.ok(restarted[0].targetSelectionRange);
    assert.equal(doc.getText(restarted[0].targetSelectionRange), 'Account');
  }
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  if (process.env.VSCODE_TEST_WORKSPACE) await testWorkspaceDefinitions(process.env.VSCODE_TEST_WORKSPACE);
  await fs.writeFile(path.join(import.meta.dirname, '../build/host-result.json'), JSON.stringify({ passed: true, installed: !!process.env.VSCODE_EXPECT_INSTALLED, vscode: vscode.version, assertions: ['activation', 'WASM loading', 'classification', 'multiline ranges', 'incremental edit', 'multiple edits', 'Unicode', 'script', 'burst updates', 'independent classifications', 'malformed kt/kts', 'typing and recovery', 'external disk reload', 'restart resynchronization', 'local and import definitions', 'definition edits and restart', 'concurrent highlights and definitions'] }, null, 2));
}

