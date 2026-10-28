import { NameResolver } from './type-resolution.ts';
import { accessible, candidates, declarationPaths, samePath as same, typeKinds as types, uniqueSymbols,
  type SymbolContext, type SymbolLocation } from './symbols.ts';

/** Follow only explicit annotations, type aliases and verified constructor initializers. */
async function receiverTypes(item: SymbolLocation, resolver: NameResolver, seen = new Set<string>()): Promise<SymbolLocation[]> {
  const key = `${item.file}:${item.declaration.nameStart}`;
  if (seen.has(key) || seen.size >= 12) return [];
  const next = new Set(seen).add(key);
  const d = item.declaration;
  if (d.kind === 'CLASS' || d.kind === 'OBJECT_DECLARATION') return [item];
  const path = d.typePath.length ? d.typePath : d.constructorPath;
  if (!path.length) return [];
  const result: SymbolLocation[] = [];
  const targets = d.typePath.length ? await resolver.typeDeclarations(path, item) : candidates(await resolver.declarations(path, item));
  if (!d.typePath.length && targets.some(target => !types.has(target.declaration.kind))) return [];
  for (const target of targets) {
    if (types.has(target.declaration.kind)) result.push(...await receiverTypes(target, resolver, next));
  }
  return uniqueSymbols(result);
}

export async function resolveNavigation(context: SymbolContext, resolver: NameResolver): Promise<SymbolLocation[]> {
  const query = context.symbols.query;
  if (!query) return [];
  const { root, members } = query;
  const selected = async (items: SymbolLocation[]): Promise<SymbolLocation[]> => {
    if (query.parameter == null) return items;
    const result: SymbolLocation[] = [];
    for (const item of items) {
      const callables = item.declaration.kind === 'TYPEALIAS' ? await receiverTypes(item, resolver) : [item];
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
    const direct = candidates(await resolver.declarations([...root.path, ...members], context)).filter(item => item.declaration.static && (!query.type || types.has(item.declaration.kind)));
    if (direct.length) return selected(direct);
  }
  let current = root.bindingStart === undefined
    ? candidates(await resolver.declarations(root.path, context))
    : context.symbols.declarations.filter(d => d.nameStart === root.bindingStart).map(declaration => ({ ...context, declaration }));
  for (const name of root.typeMembers ?? []) {
    const nested: SymbolLocation[] = [];
    for (const item of current) for (const owner of await receiverTypes(item, resolver)) {
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
      for (const owner of await receiverTypes(item, resolver)) {
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
