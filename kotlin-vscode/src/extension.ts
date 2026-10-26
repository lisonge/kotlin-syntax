import type * as VSCode from 'vscode';
import { createRequire } from 'node:module';
const vscode: typeof VSCode = createRequire(import.meta.url)('vscode');
export async function activate(context: VSCode.ExtensionContext): Promise<void> {
  if (context.extension.id === 'lisonge.kotlin-vscode-dev' && vscode.extensions.getExtension('lisonge.kotlin-vscode')) {
    void vscode.window.showInformationMessage('Kotlin Syntax is enabled, so Kotlin Syntax Dev is paused. Disable Kotlin Syntax for this workspace and reload the window to test Dev.');
    return;
  }
  const { ParserClient } = await import('./parser-client.ts');
  const { WorkspaceDefinitions } = await import('./workspace-definitions.ts');
  const { tokenDelta } = await import('./highlights.ts');
  const { tokenTypes, tokenModifiers } = await import('kotlin-parser/shared');
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
  context.subscriptions.push(changed,
    vscode.languages.registerDefinitionProvider({ language: 'kotlin' }, {
      async provideDefinition(document, position, cancellation) {
        if (cancellation.isCancellationRequested || document.isClosed) return;
        const version = document.version;
        const controller = new AbortController();
        const subscription = cancellation.onCancellationRequested(() => controller.abort());
        try {
          const offset = document.offsetAt(document.getWordRangeAtPosition(position)?.start ?? position);
          const data = await client.definitions({ key: document.uri.toString(), version, source: document.getText(), script: document.uri.path.endsWith('.kts') }, offset, controller.signal);
          if (!data || cancellation.isCancellationRequested || document.isClosed || version !== document.version) return;
          const links: VSCode.DefinitionLink[] = [];
          for (let i = 0; i < data.length; i += 4) {
            links.push({ targetUri: document.uri,
              targetRange: new vscode.Range(document.positionAt(data[i]), document.positionAt(data[i + 1])),
              targetSelectionRange: new vscode.Range(document.positionAt(data[i + 2]), document.positionAt(data[i + 3])) });
          }
          const resolved = await workspaceDefinitions.resolve(document, links, controller.signal, cancellation, offset);
          if (cancellation.isCancellationRequested || document.isClosed || version !== document.version) return;
          return resolved;
        } catch {
          return undefined; // Worker failures are reported by the shared client.
        } finally { subscription.dispose(); }
      },
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
      client.close(key); previous.delete(key);
    }),
    { dispose() { workspaceDefinitions.dispose(); void client.dispose(); previous.clear(); } });
}
