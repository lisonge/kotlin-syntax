import type { Declaration, FileSymbols } from './protocol.ts';
import { NameResolver } from './type-resolution.ts';
import { samePath, type SymbolLocation } from './symbols.ts';

/** Standard KMP layout only; source-set dependency graphs are not inferred from Gradle scripts. */
export function sourceSetLocation(path: string): { module: string; sourceSet: string; test: boolean } | undefined {
  const match = /^(.*)\/src\/([^/]+)\/kotlin\//.exec(path);
  if (!match || !/(Main|Test)$/.test(match[2])) return;
  return { module: match[1], sourceSet: match[2], test: match[2].endsWith('Test') };
}

export function counterpartAt(symbols: FileSymbols, offset: number, implementation: boolean): Declaration | undefined {
  return symbols.declarations.find(d => {
    const info = d.expectActual;
    if (!info || (implementation && info.role !== 'expect')) return false;
    return (d.nameStart <= offset && offset < d.nameEnd) ||
      (info.keyword !== null && info.keyword[0] <= offset && offset < info.keyword[1]);
  });
}

const identifier = /^(?:[\p{L}_][\p{L}\p{N}_]*|#T\d+)$/u;
async function typeParts(tokens: string[], context: SymbolLocation, resolver: NameResolver): Promise<string[] | undefined> {
  const result: string[] = [];
  let qualifier: string[] | undefined;
  const owners: (string[] | undefined)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const head = tokens[i];
    if (head === '<') { owners.push(qualifier); qualifier = undefined; result.push(head); continue; }
    if (head === '>') { qualifier = owners.pop(); result.push(head); continue; }
    // Parameter names in function types do not participate in type identity.
    if (tokens[i + 1] === ':') { i++; continue; }
    if (!identifier.test(head) || head.startsWith('#T') || ['suspend', 'in', 'out', 'vararg', 'dynamic'].includes(head) ||
      (head === 'context' && tokens[i + 1] === '(')) {
      if (head !== '.') qualifier = undefined;
      result.push(head); continue;
    }
    const owner = tokens[i - 1] === '.' ? qualifier : undefined;
    const path = [head];
    while (tokens[i + 1] === '.' && tokens[i + 2] && identifier.test(tokens[i + 2])) { path.push(tokens[i + 2]); i += 2; }
    if (owner) {
      // A type argument list does not end the enclosing user-type qualification.
      qualifier = [...owner, ...path];
    } else {
      const binding = await resolver.type(path, context);
      if (binding.status !== 'resolved') return;
      qualifier = binding.value.path;
    }
    result.push(JSON.stringify(qualifier));
  }
  return result;
}
async function compatibleTypes(left: string[], from: SymbolLocation, right: string[], to: SymbolLocation, resolver: NameResolver): Promise<boolean> {
  const a = await typeParts(left, from, resolver), b = await typeParts(right, to, resolver);
  return a !== undefined && b !== undefined && samePath(a, b);
}

/** Narrow candidates by declaration identity and explicit syntax; no type inference or alias expansion. */
export function counterpartShape(from: Declaration, source: FileSymbols, to: Declaration, target: FileSymbols): boolean {
  const a = from.expectActual, b = to.expectActual;
  if (!a || !b || a.role === b.role || JSON.stringify(source.packageName) !== JSON.stringify(target.packageName) ||
    JSON.stringify(from.path) !== JSON.stringify(to.path)) return false;
  const kind = (d: Declaration) => d.kind === 'VALUE_PARAMETER' ? 'PROPERTY' : d.kind;
  const alias = a.classifier === 'alias' || b.classifier === 'alias';
  if (alias) return !!a.classifier && !!b.classifier && a.typeParameters === b.typeParameters;
  return kind(from) === kind(to) && a.classifier === b.classifier && a.typeParameters === b.typeParameters &&
    a.suspend === b.suspend && a.parameters.length === b.parameters.length && a.contexts.length === b.contexts.length;
}

export async function matchesCounterpart(from: SymbolLocation, to: SymbolLocation, resolver: NameResolver): Promise<boolean> {
  if (!counterpartShape(from.declaration, from.symbols, to.declaration, to.symbols)) return false;
  const a = from.declaration.expectActual!, b = to.declaration.expectActual!;
  if (a.classifier === 'alias' || b.classifier === 'alias') return true;
  if (!await compatibleTypes(a.receiver, from, b.receiver, to, resolver)) return false;
  for (let i = 0; i < a.parameters.length; i++) {
    if (!await compatibleTypes(a.parameters[i], from, b.parameters[i], to, resolver)) return false;
  }
  for (let i = 0; i < a.contexts.length; i++) {
    if (!await compatibleTypes(a.contexts[i], from, b.contexts[i], to, resolver)) return false;
  }
  return true;
}
