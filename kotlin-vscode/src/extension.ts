import type * as VSCode from 'vscode';
import { createRequire } from 'node:module';
const vscode: typeof VSCode = createRequire(import.meta.url)('vscode');
export async function activate(context: VSCode.ExtensionContext): Promise<void> {
  const { ParserClient } = await import('./parser-client.ts');
  const { tokenDelta } = await import('./highlights.ts');
  const { tokenTypes, tokenModifiers } = await import('kotlin-parser/shared');
  const output = vscode.window.createOutputChannel('Kotlin Syntax', { log: true });
  context.subscriptions.push(output);
  output.info(`Activating Kotlin Syntax ${context.extension.packageJSON.version}; Node ${process.version}`);
  let notified = false;
  const client = new ParserClient(undefined, {
    log: (level, message) => output[level](message),
    onBlocked: () => {
      if (notified) return;
      notified = true;
      void vscode.window.showWarningMessage('Kotlin Syntax: parser paused after repeated failures.', 'Show Logs', 'Restart Parser').then(action => {
        if (action === 'Show Logs') output.show();
        if (action === 'Restart Parser') void vscode.commands.executeCommand('kotlinSyntax.restartParser');
      });
    },
  });
  const changed = new vscode.EventEmitter<void>();
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
    vscode.commands.registerCommand('kotlinSyntax.showLogs', () => output.show()),
    vscode.commands.registerCommand('kotlinSyntax.restartParser', () => {
      client.restart(); previous.clear(); notified = false; changed.fire();
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
    { dispose() { void client.dispose(); previous.clear(); } });
}
