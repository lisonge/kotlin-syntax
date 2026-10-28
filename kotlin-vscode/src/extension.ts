import type * as VSCode from 'vscode';
import { createRequire } from 'node:module';
const vscode: typeof VSCode = createRequire(import.meta.url)('vscode');
export async function activate(context: VSCode.ExtensionContext): Promise<void> {
  if (context.extension.id === 'lisonge.kotlin-vscode-dev' && vscode.extensions.getExtension('lisonge.kotlin-vscode')) {
    void vscode.window.showInformationMessage('Kotlin Syntax is enabled, so Kotlin Syntax Dev is paused. Disable Kotlin Syntax for this workspace and reload the window to test Dev.');
    return;
  }
  const { ParserClient } = await import('./parser-client.ts');
  const { FormatClient } = await import('./format-client.ts');
  const { loadConfig } = await import('kotlin-format/config');
  const formatter = new FormatClient();
  context.subscriptions.push({ dispose() { void formatter.dispose(); } });
  const { WorkspaceDefinitions } = await import('./workspace-definitions.ts');
  const { tokenDelta } = await import('./highlights.ts');
  const { tokenTypes, tokenModifiers } = await import('kotlin-parser/editor');
  const displayName: string = context.extension.packageJSON.displayName;
  const commands: { command: string }[] = context.extension.packageJSON.contributes.commands;
  const showLogsCommand = commands.find(entry => entry.command.endsWith('.showLogs'))!.command;
  const restartCommand = commands.find(entry => entry.command.endsWith('.restartParser'))!.command;
  const output = vscode.window.createOutputChannel(displayName, { log: true });
  context.subscriptions.push(output);
  output.info(`Activating ${displayName} ${context.extension.packageJSON.version}; Node ${process.version}`);
  let notified = false;
  const client = new ParserClient(undefined, {
    log: (level, message) => output[level](message),
    onBlocked: () => {
      if (notified) return;
      notified = true;
      void vscode.window.showWarningMessage(`${displayName}: parser paused after repeated failures.`, 'Show Logs', 'Restart Parser').then(action => {
        if (action === 'Show Logs') output.show();
        if (action === 'Restart Parser') void vscode.commands.executeCommand(restartCommand);
      });
    },
  });
  const changed = new vscode.EventEmitter<void>();
  const workspaceDefinitions = new WorkspaceDefinitions(client);
  const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
  const previous = new Map<string, VSCode.SemanticTokens>();
  let serial = 0;
  async function provide(document: VSCode.TextDocument, cancellation: VSCode.CancellationToken) {
    if (cancellation.isCancellationRequested || document.isClosed) return;
    const version = document.version;
    const controller = new AbortController();
    const subscription = cancellation.onCancellationRequested(() => controller.abort());
    try {
      const data = await client.request({ key: document.uri.toString(), version, source: document.getText(), script: document.uri.path.endsWith('.kts') }, controller.signal);
      if (!data || cancellation.isCancellationRequested || document.isClosed || version !== document.version) return;
      return new vscode.SemanticTokens(data, String(++serial));
    } catch {
      // The client logs the underlying fault once; paused requests do not flood the log.
      return undefined;
    } finally { subscription.dispose(); }
  }
  async function navigate(document: VSCode.TextDocument, position: VSCode.Position, cancellation: VSCode.CancellationToken, implementation = false) {
    if (cancellation.isCancellationRequested || document.isClosed) return;
    const version = document.version;
    const controller = new AbortController();
    const subscription = cancellation.onCancellationRequested(() => controller.abort());
    try {
      const offset = document.offsetAt(document.getWordRangeAtPosition(position)?.start ?? position);
      const links: VSCode.DefinitionLink[] = [];
      if (!implementation) {
        const data = await client.definitions({ key: document.uri.toString(), version, source: document.getText(), script: document.uri.path.endsWith('.kts') }, offset, controller.signal);
        if (!data || cancellation.isCancellationRequested || document.isClosed || version !== document.version) return;
        for (let i = 0; i < data.length; i += 4) {
          links.push({ targetUri: document.uri,
            targetRange: new vscode.Range(document.positionAt(data[i]), document.positionAt(data[i + 1])),
            targetSelectionRange: new vscode.Range(document.positionAt(data[i + 2]), document.positionAt(data[i + 3])) });
        }
      }
      const resolved = await workspaceDefinitions.resolve(document, links, controller.signal, cancellation, offset, implementation);
      if (cancellation.isCancellationRequested || document.isClosed || version !== document.version) return;
      return resolved;
    } catch {
      return undefined; // Worker failures are reported by the shared client.
    } finally { subscription.dispose(); }
  }
  context.subscriptions.push(changed,
    vscode.languages.registerDocumentFormattingEditProvider({ language: 'kotlin' }, {
      async provideDocumentFormattingEdits(document, _options, cancellation) {
        if (cancellation.isCancellationRequested || document.isClosed) return;
        const version = document.version;
        const source = document.getText();
        const config = vscode.workspace.getConfiguration('kotlinSyntax.format', document.uri);
        const controller = new AbortController();
        const subscription = cancellation.onCancellationRequested(() => controller.abort());
        try {
            const projectConfig = document.uri.scheme === 'file'
              ? await loadConfig(document.uri.fsPath, { allowCode: vscode.workspace.isTrusted }) : {};
          const text = await formatter.request({ key: document.uri.toString(), source, script: document.uri.path.endsWith('.kts'),
              style: config.get('style', 'KOTLINLANG'), maxWidth: config.get('maxWidth', 100), ...projectConfig }, controller.signal);
          if (text === undefined || text === source || cancellation.isCancellationRequested || document.isClosed || document.version !== version) return [];
          return [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0), document.positionAt(source.length)), text)];
        } catch (error) {
          output.warn(`Formatting failed: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        } finally { subscription.dispose(); }
      },
    }),
    vscode.languages.registerDefinitionProvider({ language: 'kotlin' }, {
      provideDefinition: (document, position, cancellation) => navigate(document, position, cancellation),
    }),
    vscode.languages.registerImplementationProvider({ language: 'kotlin' }, {
      provideImplementation: (document, position, cancellation) => navigate(document, position, cancellation, true),
    }),
    vscode.commands.registerCommand(showLogsCommand, () => output.show()),
    vscode.commands.registerCommand(restartCommand, () => {
      client.restart(); workspaceDefinitions.clear(); previous.clear(); notified = false; changed.fire();
    }),
    vscode.languages.registerDocumentSemanticTokensProvider({ language: 'kotlin' }, {
      onDidChangeSemanticTokens: changed.event,
      async provideDocumentSemanticTokens(document, cancellation) {
        const result = await provide(document, cancellation);
        if (result) previous.set(document.uri.toString(), result);
        return result;
      },
      async provideDocumentSemanticTokensEdits(document, resultId, cancellation) {
        const old = previous.get(document.uri.toString()), result = await provide(document, cancellation);
        if (!result) return;
        previous.set(document.uri.toString(), result);
        if (!old || old.resultId !== resultId) return result;
        const edit = tokenDelta(old.data, result.data);
        return new vscode.SemanticTokensEdits(edit.deleteCount || edit.data.length ? [new vscode.SemanticTokensEdit(edit.start, edit.deleteCount, edit.data)] : [], result.resultId);
      }
    }, legend),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId !== 'kotlin' || !event.contentChanges.length) return;
      client.change(event.document.uri.toString(), event.document.version,
        event.contentChanges.map(change => ({ start: change.rangeOffset, end: change.rangeOffset + change.rangeLength, text: change.text })));
      changed.fire();
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      const key = document.uri.toString();
      client.close(key); formatter.close(key); previous.delete(key);
    }),
    { dispose() { workspaceDefinitions.dispose(); void client.dispose(); previous.clear(); } });
}
