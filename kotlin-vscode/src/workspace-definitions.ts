import type * as VSCode from 'vscode';
import { createRequire } from 'node:module';
import type { ParserClient } from './parser-client.ts';
import type { FileSymbols } from './protocol.ts';
import { resolveNavigation } from './navigation.ts';
import { accessible, candidates, uniqueSymbols, type SymbolLocation, type SymbolLookup } from './symbols.ts';
import { NameResolver } from './type-resolution.ts';
import { WorkspaceSymbols } from './workspace-symbols.ts';
import { counterpartAt, counterpartShape, matchesCounterpart, sourceSetLocation } from './expect-actual.ts';
const vscode: typeof VSCode = createRequire(import.meta.url)('vscode');

/** Adapts explicit navigation requests to source lookup, binding, and editor locations. */
export class WorkspaceDefinitions {
  private readonly workspace: WorkspaceSymbols;
  private readonly client: Pick<ParserClient, 'symbols' | 'close'>;
  constructor(client: Pick<ParserClient, 'symbols' | 'close'>,
    fs: Pick<VSCode.FileSystem, 'stat' | 'readDirectory' | 'readFile'> = vscode.workspace.fs) {
    this.client = client;
    this.workspace = new WorkspaceSymbols(client, fs);
  }
  clear() { this.workspace.clear(); }
  dispose() { this.workspace.dispose(); }

  async resolve(document: VSCode.TextDocument, links: VSCode.DefinitionLink[], signal: AbortSignal, token: VSCode.CancellationToken, offset?: number, implementation = false): Promise<VSCode.DefinitionLink[]> {
    if (signal.aborted || token.isCancellationRequested || !vscode.workspace.getWorkspaceFolder(document.uri)) return links;
    // Local bindings need no metadata request or workspace search.
    if (links.length && !links.some(link => /^\s*import\b/.test(document.getText(link.targetRange)) ||
      (offset !== undefined && link.targetSelectionRange?.contains(document.positionAt(offset))))) return links;
    const version = document.version;
    const json = await this.client.symbols({ key: document.uri.toString(), source: document.getText(), version, script: document.uri.path.endsWith('.kts') }, signal, offset);
    if (!json || signal.aborted || document.version !== version) return links;
    const symbols: FileSymbols = JSON.parse(json);
    const counterpart = offset === undefined ? undefined : counterpartAt(symbols, offset, implementation);
    if (implementation && !counterpart) return [];
    const sourceSet = counterpart && sourceSetLocation(document.uri.path);
    if (counterpart && !sourceSet) return [];
    const counterpartFile = (uri: VSCode.Uri, includeSourceSet = false) => {
      const target = sourceSetLocation(uri.path);
      return sourceSet && target && uri.scheme === document.uri.scheme && uri.authority === document.uri.authority &&
        document.uri.with({ path: sourceSet.module }).toString() === uri.with({ path: target.module }).toString() &&
        sourceSet.test === target.test && (includeSourceSet || sourceSet.sourceSet !== target.sourceSet);
    };
    this.workspace.rememberRoot(document.uri, symbols.packageName);
    const imports: { name: string; path: string[]; start: number; end: number }[] = symbols.imports.filter(item => !item.star && links.some(link => document.offsetAt(link.targetRange.start) === item.start && document.offsetAt(link.targetRange.end) === item.end));
    if (!links.length && offset !== undefined) {
      for (const item of symbols.imports) {
        const segment = item.segments.find(segment => segment.start <= offset && offset < segment.end);
        if (segment) imports.push({ ...item, path: segment.path });
      }
    }
    if (!links.length && (symbols.reference?.constructorOnly || symbols.reference?.importOnly)) imports.push(...symbols.imports.filter(item => !item.star && item.name === symbols.reference!.name));
    const samePackage = links.length || imports.length || symbols.reference?.importOnly ? undefined : symbols.reference;
    if (!counterpart && !imports.length && !samePackage && !symbols.query) return links;
    const request = this.workspace.request(document, symbols, signal, token);
    const lookup: SymbolLookup = (path, context) => request.lookup(path, context);
    const resolver = new NameResolver(counterpart
      ? (path, context) => request.lookup(path, context, { key: 'counterpart-types', files: uri => !!counterpartFile(uri, true) })
      : lookup);
    const context = { file: document.uri.toString(), symbols, offset };
    const found: SymbolLocation[] = [];
    const fallback: VSCode.DefinitionLink[] = [];
    if (counterpart) {
      const candidates = await request.lookup([...symbols.packageName, ...counterpart.path], context, {
        key: 'counterparts', files: uri => !!counterpartFile(uri), name: counterpart.path[0],
        matches: item => counterpartShape(counterpart, symbols, item.declaration, item.symbols),
      });
      for (const candidate of candidates) {
        if (signal.aborted || token.isCancellationRequested || document.version !== version) return [];
        if (await matchesCounterpart({ ...context, declaration: counterpart }, candidate, resolver)) found.push(candidate);
      }
    }
    else if (symbols.query) found.push(...await resolveNavigation(context, resolver));
    else if (samePackage) {
      found.push(...(candidates(await resolver.declarations([samePackage.name], context))).filter(item => item.declaration.static && !item.declaration.extension &&
        (!samePackage.type || ['CLASS', 'OBJECT_DECLARATION', 'TYPEALIAS'].includes(item.declaration.kind)) &&
        (!samePackage.constructorOnly || ['CLASS', 'TYPEALIAS'].includes(item.declaration.kind))));
    } else for (const item of imports) {
      const matches = (await lookup(item.path, context)).filter(item => accessible(item.declaration, item.file === context.file, offset) && item.declaration.static &&
        (!symbols.reference?.constructorOnly || ['CLASS', 'TYPEALIAS'].includes(item.declaration.kind)));
      found.push(...matches);
      if (!matches.length) fallback.push(...links.filter(link => document.offsetAt(link.targetRange.start) === item.start));
    }
    const results: VSCode.DefinitionLink[] = [...fallback];
    const keyword = counterpart?.expectActual?.keyword;
    const origin = counterpart && (keyword && keyword[0] <= offset! && offset! < keyword[1]
      ? keyword : [counterpart.nameStart, counterpart.nameEnd]);
    for (const item of uniqueSymbols(found)) {
      if (signal.aborted || document.version !== version) return links;
      let target: VSCode.TextDocument;
      try { target = await vscode.workspace.openTextDocument(vscode.Uri.parse(item.file)); } catch { continue; }
      if (!request.unchanged(item.file, target.getText())) continue;
      const d = item.declaration;
      results.push({ targetUri: target.uri, targetRange: new vscode.Range(target.positionAt(d.start), target.positionAt(d.end)),
        targetSelectionRange: new vscode.Range(target.positionAt(d.nameStart), target.positionAt(d.nameEnd)),
        ...(origin ? { originSelectionRange: new vscode.Range(document.positionAt(origin[0]), document.positionAt(origin[1])) } : {}) });
    }
    return results;
  }
}
