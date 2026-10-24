import type * as VSCode from 'vscode';
import { createRequire } from 'node:module';
const vscode: typeof VSCode = createRequire(import.meta.url)('vscode');
import assert from 'node:assert/strict';
import { cases, typing } from './highlight-cases.ts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
export async function run() {
  const manifest = JSON.parse(await fs.readFile(path.join(import.meta.dirname, '../package.json'), 'utf8'));
  const extension = vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`);
  assert.ok(extension, 'Extension discovered');
  if (process.env.VSCODE_EXPECT_INSTALLED) {
    assert.equal(path.dirname(extension.extensionPath), process.env.VSCODE_EXPECT_EXTENSIONS_DIR, 'Testing the installed copy, not the workspace');
    assert.equal(extension.packageJSON.main, './dist/extension.js');
    assert.equal(extension.packageJSON.version, JSON.parse(await fs.readFile(path.join(import.meta.dirname, '../package.json'), 'utf8')).version);
  }
  await extension.activate();
  assert.ok(extension.isActive, 'Extension activated');
  const source = 'package demo\nclass A {}\nclass B {}\n/** comment\n * next */\n@A(types = [String::class])\nfun greet(name: String): String = """hello\nworld"""\nval count = 42\n';
  const document = await vscode.workspace.openTextDocument({ language: 'kotlin', content: source });
  await vscode.window.showTextDocument(document);
  const legend = await vscode.commands.executeCommand<VSCode.SemanticTokensLegend>('vscode.provideDocumentSemanticTokensLegend', document.uri);
  assert.ok(legend);
  assert.ok(legend.tokenTypes.includes('function'));
  async function tokens(doc: VSCode.TextDocument) {
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
      const [dl, dc, length, type, modifiers] = result.data.slice(i, i + 5);
      char = dl === 0 ? char + dc : dc; line += dl;
      assert.ok(length > 0 && char + length <= doc.lineAt(line).text.length, 'Valid single-line token');
      decoded.push({ text: doc.lineAt(line).text.slice(char, char + length), type: legend.tokenTypes[type], modifiers });
    }
    return decoded;
  }
  await vscode.commands.executeCommand('kotlinSyntax.showLogs');
  await vscode.commands.executeCommand('kotlinSyntax.restartParser');
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
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await fs.writeFile(path.join(import.meta.dirname, '../build/host-result.json'), JSON.stringify({ passed: true, installed: !!process.env.VSCODE_EXPECT_INSTALLED, vscode: vscode.version, assertions: ['activation', 'WASM loading', 'classification', 'multiline ranges', 'incremental edit', 'multiple edits', 'Unicode', 'script', 'burst updates', 'independent classifications', 'malformed kt/kts', 'typing and recovery'] }, null, 2));
}

