import type * as VSCode from 'vscode';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import type { ParserClient } from './parser-client.ts';
import type { FileSymbols } from './protocol.ts';
import { containsName } from './name-filter.ts';
import { excludedWorkspaceDirectory, kotlinFiles } from './workspace-files.ts';
import { declarationPaths, uniqueSymbols, type SymbolContext, type SymbolLocation } from './symbols.ts';

const vscode: typeof VSCode = createRequire(import.meta.url)('vscode');

export interface SymbolSearch {
  key: string;
  files(uri: VSCode.Uri): boolean;
  name?: string;
  matches?(declaration: SymbolLocation): boolean;
}

/** Workspace inventory, source snapshots and summary caching. Binding policy belongs to NameResolver. */
export class WorkspaceSymbols {
  private cache = new Map<string, { hash: string; symbols: FileSymbols }>();
  private roots = new Map<string, { uri: VSCode.Uri; prefix: string[] }>();
  private serial = 0;
  private directories: VSCode.Uri[] | undefined;
  private directoryVersion = 0;
  private readonly subscriptions: VSCode.Disposable[];
  private readonly client: Pick<ParserClient, 'symbols' | 'close'>;
  private readonly fs: Pick<VSCode.FileSystem, 'stat' | 'readDirectory' | 'readFile'>;
  constructor(client: Pick<ParserClient, 'symbols' | 'close'>, fs: Pick<VSCode.FileSystem, 'stat' | 'readDirectory' | 'readFile'> = vscode.workspace.fs) {
    this.client = client;
    this.fs = fs;
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    const invalidate = () => { this.directories = undefined; this.directoryVersion++; };
    const relevant = (uri: VSCode.Uri) => {
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      if (!folder) return false;
      const parts = uri.path.slice(folder.uri.path.length + 1).split('/');
      return !parts.slice(0, -1).some(excludedWorkspaceDirectory) &&
        (parts.at(-1) === '.gitignore' || parts.at(-1)!.endsWith('.kt') || !excludedWorkspaceDirectory(parts.at(-1)!));
    };
    const changed = (uri: VSCode.Uri, deleted: boolean) => {
      if (!relevant(uri)) return;
      if (uri.path.endsWith('.kt') || uri.path.endsWith('/.gitignore')) { invalidate(); return; }
      if (deleted) {
        if (this.directories?.some(d => d.toString() === uri.toString() || d.toString().startsWith(uri.toString() + '/'))) invalidate();
      } else void this.fs.stat(uri).then(stat => { if (stat.type === vscode.FileType.Directory) invalidate(); }, () => {});
    };
    this.subscriptions = [watcher, watcher.onDidCreate(uri => changed(uri, false)), watcher.onDidDelete(uri => changed(uri, true)),
      watcher.onDidChange(uri => { if (uri.path.endsWith('/.gitignore') && relevant(uri)) invalidate(); }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => { this.clear(); })];
  }
  clear() { this.cache.clear(); this.roots.clear(); this.directories = undefined; this.directoryVersion++; }
  dispose() { this.subscriptions.forEach(item => item.dispose()); this.clear(); }

  rememberRoot(uri: VSCode.Uri, packageName: string[]) {
    const directory = vscode.Uri.joinPath(uri, '..');
    const parts = directory.path.split('/');
    let count = 0;
    while (count < packageName.length && parts.at(-count - 1) === packageName.at(-count - 1)) count++;
    const root = directory.with({ path: parts.slice(0, parts.length - count).join('/') || '/' });
    if (vscode.workspace.getWorkspaceFolder(root)) this.roots.set(root.toString(), { uri: root, prefix: packageName.slice(0, packageName.length - count) });
  }

  private async summary(uri: VSCode.Uri, source: string, hash: string, signal: AbortSignal): Promise<FileSymbols | undefined> {
    const cached = this.cache.get(uri.toString());
    if (cached?.hash === hash) return cached.symbols;
    const key = `workspace-symbols:${++this.serial}:${uri.toString()}`;
    try {
      const json = await this.client.symbols({ key, source, version: 1, script: false }, signal);
      if (!json || signal.aborted) return;
      const symbols: FileSymbols = JSON.parse(json);
      this.cache.delete(uri.toString());
      this.cache.set(uri.toString(), { hash, symbols });
      if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
      this.rememberRoot(uri, symbols.packageName);
      return symbols;
    } finally { this.client.close(key); }
  }

  request(document: VSCode.TextDocument, symbols: FileSymbols, signal: AbortSignal, token: VSCode.CancellationToken) {
    const version = document.version;
    const cancelled = () => signal.aborted || token.isCancellationRequested || document.version !== version;
    let files: VSCode.Uri[] | undefined;
    let scannedWorkspace = false;
    const sources = new Map<string, string>();
    const hashes = new Map<string, string>();
    const summaries = new Map<string, FileSymbols>();
    const entries = new Map<string, [string, VSCode.FileType][]>();
    const ignoreFiles = new Map<string, string | undefined>();
    const lookups = new Map<string, SymbolLocation[]>();
    const lookup = async (path: string[], context: SymbolContext, search?: SymbolSearch): Promise<SymbolLocation[]> => {
      if (cancelled() || !path.length) return [];
      const lookupKey = JSON.stringify([context.file, path, search?.key, this.directoryVersion, this.roots.size]);
      const cachedLookup = lookups.get(lookupKey);
      if (cachedLookup) return cachedLookup;
      const name = search?.name ?? path.at(-1)!;
      // Import prefixes may denote packages or object owners; validate the full path after parsing.
      const packages = Array.from({ length: path.length }, (_, index) => path.slice(0, path.length - index - 1));
      const directories = new Set<string>();
      directories.add(vscode.Uri.joinPath(vscode.Uri.parse(context.file), '..').toString());
      for (const packageName of packages) for (const { uri, prefix } of this.roots.values()) {
        if (prefix.every((part, index) => packageName[index] === part)) {
          const suffix = packageName.slice(prefix.length);
          if (suffix.every(part => !/[\\/]/.test(part) && part !== '.' && part !== '..')) directories.add(vscode.Uri.joinPath(uri, ...suffix).toString());
        }
      }
      const inventoryVersion = this.directoryVersion;
      const knownDirectories = this.directories;
      if (knownDirectories) for (const directory of knownDirectories) {
        if (search ? search.files(vscode.Uri.joinPath(directory, '_')) :
          packages.some(parts => parts.length > 0 && directory.path.endsWith('/' + parts.join('/')))) directories.add(directory.toString());
      }
      if (!files || knownDirectories) {
        if (!knownDirectories) scannedWorkspace = true;
        const selectedFiles: VSCode.Uri[] = [];
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
          const prefix = folder.uri.toString().replace(/\/$/, '') + '/';
          const selected = knownDirectories ? new Set([...directories].filter(uri => uri === folder.uri.toString() || uri.startsWith(prefix)).map(uri => {
            const path = vscode.Uri.parse(uri).path.slice(folder.uri.path.replace(/\/$/, '').length).replace(/^\//, '');
            return path ? path + '/' : '';
          })) : undefined;
          if (selected?.size === 0) continue;
          const relative = await kotlinFiles({
            entries: async path => {
              try {
                const uri = vscode.Uri.joinPath(folder.uri, path);
                let listed = entries.get(uri.toString());
                if (!listed) { listed = await this.fs.readDirectory(uri); entries.set(uri.toString(), listed); }
                return listed.map(([name, type]) => ({
                  name, directory: type === vscode.FileType.Directory, file: type === vscode.FileType.File,
                }));
              } catch { return []; }
            },
            ignoreFile: async path => {
              const uri = vscode.Uri.joinPath(folder.uri, path, '.gitignore');
              if (ignoreFiles.has(uri.toString())) return ignoreFiles.get(uri.toString());
              let text: string | undefined;
              try { text = new TextDecoder().decode(await this.fs.readFile(uri)); } catch { /* No ignore file. */ }
              ignoreFiles.set(uri.toString(), text);
              return text;
            },
          }, cancelled, selected);
          selectedFiles.push(...relative.map(path => vscode.Uri.joinPath(folder.uri, path)));
        }
        files = selectedFiles;
        if (!knownDirectories && !signal.aborted && !token.isCancellationRequested && document.version === version && this.directoryVersion === inventoryVersion) {
          this.directories = [...new Map(files.map(uri => { const directory = vscode.Uri.joinPath(uri, '..'); return [directory.toString(), directory] as const; })).values()];
        }
      }
      const candidates = files.filter(uri => {
        if (search) return search.files(uri);
        const directory = vscode.Uri.joinPath(uri, '..');
        return directories.has(directory.toString()) || packages.some(parts => parts.length > 0 && directory.path.endsWith('/' + parts.join('/')));
      }).sort((a, b) => Number(!a.path.endsWith('/' + name + '.kt')) - Number(!b.path.endsWith('/' + name + '.kt')));
      const found: SymbolLocation[] = [];
      const match = (file: string, summary: FileSymbols) => summary.declarations
        .map(declaration => ({ file, symbols: summary, declaration }))
        .filter(item => search?.matches ? search.matches(item) :
          declarationPaths(item.declaration).some(parts => JSON.stringify([...summary.packageName, ...parts]) === JSON.stringify(path)));
      if (!search || search.files(document.uri)) found.push(...match(document.uri.toString(), symbols));
      for (const uri of candidates) {
        if (uri.toString() === document.uri.toString()) continue;
        if (cancelled()) return [];
        const opened = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        let source: string;
        try {
          source = sources.get(uri.toString()) ?? opened?.getText() ?? new TextDecoder().decode(await this.fs.readFile(uri));
          sources.set(uri.toString(), source);
        }
        catch { continue; } // A deleted or unreadable candidate does not invalidate the import fallback.
        if (!containsName(source, name)) continue;
        let hash = hashes.get(uri.toString());
        if (hash === undefined) { hash = createHash('sha256').update(source).digest('hex'); hashes.set(uri.toString(), hash); }
        const summary = summaries.get(uri.toString()) ?? await this.summary(uri, source, hash, signal);
        if (!summary) continue;
        summaries.set(uri.toString(), summary);
        found.push(...match(uri.toString(), summary));
      }
      if (!found.length && knownDirectories && !scannedWorkspace && !signal.aborted && !token.isCancellationRequested) {
        this.directories = undefined;
        files = undefined;
        return lookup(path, context, search);
      }
      const result = uniqueSymbols(found);
      lookups.set(lookupKey, result);
      return result;
    };
    return {
      lookup,
      unchanged: (file: string, text: string) => file === document.uri.toString() || hashes.get(file) === createHash('sha256').update(text).digest('hex'),
    };
  }
}
