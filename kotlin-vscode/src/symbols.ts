import type { Declaration, FileSymbols } from './protocol.ts';

export interface SymbolContext { file: string; symbols: FileSymbols; declaration?: Declaration; offset?: number }
export interface SymbolLocation extends SymbolContext { declaration: Declaration }
export type SymbolLookup = (path: string[], context: SymbolContext) => Promise<SymbolLocation[]>;
export type Resolution<T> = { status: 'resolved'; value: T } | { status: 'ambiguous'; candidates: T[] } | { status: 'unresolved' };

export const typeKinds = new Set(['CLASS', 'OBJECT_DECLARATION', 'TYPEALIAS']);
export const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((part, index) => part === b[index]);
export const declarationPaths = (d: Declaration) => [d.path, ...d.aliases];
export const symbolIdentity = (item: SymbolLocation) => `${item.file}:${item.declaration.nameStart}`;
export const accessible = (d: Declaration, sameFile: boolean, offset?: number) => !d.private ||
  (sameFile && (d.privateScopes ?? []).every(([start, end]) => offset !== undefined && start <= offset && offset < end));
export function uniqueSymbols(items: SymbolLocation[]): SymbolLocation[] {
  return [...new Map(items.map(item => [symbolIdentity(item), item])).values()];
}
export function resolution<T>(candidates: T[]): Resolution<T> {
  return candidates.length === 1 ? { status: 'resolved', value: candidates[0] } :
    candidates.length ? { status: 'ambiguous', candidates } : { status: 'unresolved' };
}
export function candidates<T>(result: Resolution<T>): T[] {
  return result.status === 'resolved' ? [result.value] : result.status === 'ambiguous' ? result.candidates : [];
}
