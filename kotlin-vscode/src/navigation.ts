import type { Declaration, FileSymbols } from './protocol.ts';

export interface SymbolLocation { file: string; symbols: FileSymbols; declaration: Declaration }
export type SymbolLookup = (path: string[], context: SymbolLocation | { file: string; symbols: FileSymbols }) => Promise<SymbolLocation[]>;
const types = new Set(['CLASS', 'OBJECT_DECLARATION', 'TYPEALIAS']);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((part, index) => part === b[index]);
export const declarationPaths = (d: Declaration) => [d.path, ...d.aliases];
export const accessible = (d: Declaration, sameFile: boolean, offset?: number) => !d.private ||
  (sameFile && (d.privateScopes ?? []).every(([start, end]) => offset !== undefined && start <= offset && offset < end));
export function uniqueSymbols(items: SymbolLocation[]): SymbolLocation[] {
  return [...new Map(items.map(item => [`${item.file}:${item.declaration.nameStart}`, item])).values()];
}

/** Ordered lexical path lookup: explicit imports, same package, wildcard imports, qualified path. */
export async function resolveName(path: string[], context: { file: string; symbols: FileSymbols }, lookup: SymbolLookup): Promise<SymbolLocation[]> {
  if (!path.length) return [];
  const imported = context.symbols.imports.filter(item => !item.star && item.name === path[0]);
  if (imported.length) {
    const found: SymbolLocation[] = [];
    for (const item of imported) found.push(...await lookup([...item.path, ...path.slice(1)], context));
    return uniqueSymbols(found);
  }
  const inPackage = await lookup([...context.symbols.packageName, ...path], context);
  if (inPackage.length) return inPackage;
  const wildcard: SymbolLocation[] = [];
  for (const item of context.symbols.imports.filter(item => item.star)) wildcard.push(...await lookup([...item.path, ...path], context));
  if (wildcard.length) return uniqueSymbols(wildcard);
  return path.length > 1 ? lookup(path, context) : [];
}

/** Follow only explicit annotations, type aliases and verified constructor initializers. */
async function receiverTypes(item: SymbolLocation, lookup: SymbolLookup, seen = new Set<string>()): Promise<SymbolLocation[]> {
  const key = `${item.file}:${item.declaration.nameStart}`;
  if (seen.has(key) || seen.size >= 12) return [];
  const next = new Set(seen).add(key);
  const d = item.declaration;
  if (d.kind === 'CLASS' || d.kind === 'OBJECT_DECLARATION') return [item];
  const path = d.typePath.length ? d.typePath : d.constructorPath;
  if (!path.length) return [];
  const result: SymbolLocation[] = [];
  const targets = await resolveName(path, item, lookup);
  if (!d.typePath.length && targets.some(target => !types.has(target.declaration.kind))) return [];
  for (const target of targets) {
    if (types.has(target.declaration.kind)) result.push(...await receiverTypes(target, lookup, next));
  }
  return uniqueSymbols(result);
}

export async function resolveNavigation(context: { file: string; symbols: FileSymbols }, lookup: SymbolLookup): Promise<SymbolLocation[]> {
  const query = context.symbols.query;
  if (!query) return [];
  const { root, members } = query;
  const selected = async (items: SymbolLocation[]): Promise<SymbolLocation[]> => {
    if (query.parameter == null) return items;
    const result: SymbolLocation[] = [];
    for (const item of items) {
      const callables = item.declaration.kind === 'TYPEALIAS' ? await receiverTypes(item, lookup) : [item];
      for (const callable of callables) for (const p of callable.declaration.parameters ?? []) {
        if (p.name === query.parameter) result.push({ ...callable, declaration: {
          ...callable.declaration, ...p, kind: 'VALUE_PARAMETER', parameters: [], path: [...callable.declaration.path, p.name], aliases: [],
        } });
      }
    }
    return uniqueSymbols(result);
  };
  // Static qualified paths are validated against declaration ownership, not spelling/capitalization.
  if (root.mode === 'symbol' && root.bindingStart === undefined && !root.typeOnly) {
    const direct = (await resolveName([...root.path, ...members], context, lookup)).filter(item => item.declaration.static && (!query.type || types.has(item.declaration.kind)));
    if (direct.length) return selected(direct);
  }
  let current = root.bindingStart === undefined
    ? await resolveName(root.path, context, lookup)
    : context.symbols.declarations.filter(d => d.nameStart === root.bindingStart).map(declaration => ({ ...context, declaration }));
  for (const name of root.typeMembers ?? []) {
    const nested: SymbolLocation[] = [];
    for (const item of current) for (const owner of await receiverTypes(item, lookup)) {
      nested.push(...owner.symbols.declarations.filter(d => types.has(d.kind) && accessible(d, owner.file === context.file, query.offset) &&
        declarationPaths(d).some(path => same(path, [...owner.declaration.path, name]))).map(declaration => ({ ...owner, declaration })));
    }
    current = uniqueSymbols(nested);
  }
  let instance = root.mode !== 'symbol';
  if (root.typeOnly) current = current.filter(item => types.has(item.declaration.kind));
  if (root.mode === 'constructor' && current.some(item => !types.has(item.declaration.kind))) return [];
  if (instance) current = current.filter(item => types.has(item.declaration.kind));
  for (const [memberIndex, name] of members.entries()) {
    const found: SymbolLocation[] = [];
    for (const item of current) {
      const valueReceiver = instance || !types.has(item.declaration.kind);
      for (const owner of await receiverTypes(item, lookup)) {
        const ownerPath = owner.declaration.path;
        const matches = owner.symbols.declarations.filter(d => !d.extension &&
          accessible(d, owner.file === context.file, query.offset) &&
          declarationPaths(d).some(path => same(path, [...ownerPath, name])) &&
          (owner.declaration.kind === 'OBJECT_DECLARATION' || (query.callable && memberIndex === members.length - 1) || (valueReceiver ? !d.static : d.static)));
        found.push(...matches.map(declaration => ({ ...owner, declaration })));
      }
    }
    current = uniqueSymbols(found);
    // A selected property has a value receiver for the next segment; a selected nested type does not.
    instance = false;
  }
  return selected(current.filter(item => !query.type || types.has(item.declaration.kind)));
}
