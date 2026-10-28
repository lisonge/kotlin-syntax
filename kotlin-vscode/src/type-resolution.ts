import { defaultTypes } from './default-types.ts';
import { accessible, candidates, declarationPaths, resolution, samePath, typeKinds, uniqueSymbols,
  type Resolution, type SymbolContext, type SymbolLocation, type SymbolLookup } from './symbols.ts';

export interface TypeIdentity { path: string[]; provenance: 'declaration' | 'import' | 'qualified' | 'stdlib'; declarations: SymbolLocation[] }

/** Request-scoped binding policy shared by member navigation and counterpart signatures. */
export class NameResolver {
  private types = new Map<string, Promise<Resolution<TypeIdentity>>>();
  private readonly lookup: SymbolLookup;
  constructor(lookup: SymbolLookup) { this.lookup = lookup; }

  private local(path: string[], context: SymbolContext, typesOnly: boolean): SymbolLocation[] {
    return context.symbols.declarations.filter(d => (!typesOnly || typeKinds.has(d.kind)) &&
      accessible(d, true, context.declaration?.nameStart ?? context.offset) &&
      declarationPaths(d).some(parts => samePath(parts, path))).map(declaration => ({ ...context, declaration }));
  }
  private async at(path: string[], context: SymbolContext, typesOnly: boolean): Promise<SymbolLocation[]> {
    return uniqueSymbols((await this.lookup(path, context)).filter(item => (!typesOnly || typeKinds.has(item.declaration.kind)) &&
      accessible(item.declaration, item.file === context.file, context.declaration?.nameStart ?? context.offset)));
  }
  private identified(items: SymbolLocation[]): TypeIdentity[] {
    const groups = new Map<string, TypeIdentity>();
    for (const item of items) {
      const path = [...item.symbols.packageName, ...item.declaration.path];
      const key = JSON.stringify(path);
      const identity = groups.get(key) ?? { path, provenance: 'declaration', declarations: [] };
      identity.declarations.push(item); groups.set(key, identity);
    }
    return [...groups.values()];
  }
  private named(path: string[], provenance: TypeIdentity['provenance']): TypeIdentity {
    return { path, provenance, declarations: [] };
  }
  private result(items: TypeIdentity[]): Resolution<TypeIdentity> {
    return resolution([...new Map(items.map(item => [JSON.stringify(item.path), item])).values()]);
  }

  /** Each tier either binds the name or passes it to the next tier; candidates from different tiers never mix. */
  private async bind(path: string[], context: SymbolContext, typesOnly: boolean): Promise<Resolution<TypeIdentity>> {
    if (!path.length) return { status: 'unresolved' };
    const owner = context.declaration?.path.slice(0, -1) ?? [];
    for (let depth = owner.length; depth > 0; depth--) {
      const head = [...owner.slice(0, depth), path[0]];
      if (this.local(head, context, typesOnly).length) {
        return this.result(this.identified(this.local([...head, ...path.slice(1)], context, typesOnly)));
      }
    }
    const imports = context.symbols.imports.filter(item => !item.star && item.name === path[0]);
    if (imports.length) {
      const found: TypeIdentity[] = [];
      for (const item of imports) {
        const full = [...item.path, ...path.slice(1)];
        found.push(...(typesOnly ? [this.named(full, 'import')] : this.identified(await this.at(full, context, false))));
      }
      return this.result(found);
    }
    if (this.local([path[0]], context, typesOnly).length) {
      return this.result(this.identified(this.local(path, context, typesOnly)));
    }
    const inPackage = await this.at([...context.symbols.packageName, ...path], context, typesOnly);
    if (inPackage.length) return this.result(this.identified(inPackage));
    const stars: TypeIdentity[] = [];
    for (const item of context.symbols.imports.filter(item => item.star)) {
      const full = [...item.path, ...path];
      stars.push(...this.identified(await this.at(full, context, typesOnly)));
      if (typesOnly && samePath(defaultTypes.get(path[0]) ?? [], [...item.path, path[0]])) stars.push(this.named(full, 'stdlib'));
    }
    if (stars.length) return this.result(stars);
    const standard = typesOnly && defaultTypes.get(path[0]);
    if (standard) return this.result([this.named([...standard, ...path.slice(1)], 'stdlib')]);
    if (path.length > 1) {
      const qualified = await this.at(path, context, typesOnly);
      if (qualified.length) return this.result(this.identified(qualified));
      // A written qualified name retains its spelling, including when dependency sources are unavailable.
      if (typesOnly) return this.result([this.named(path, 'qualified')]);
    }
    return { status: 'unresolved' };
  }

  async declarations(path: string[], context: SymbolContext): Promise<Resolution<SymbolLocation>> {
    return resolution(uniqueSymbols(candidates(await this.bind(path, context, false)).flatMap(item => item.declarations)));
  }
  type(path: string[], context: SymbolContext): Promise<Resolution<TypeIdentity>> {
    const key = JSON.stringify([context.file, context.declaration?.nameStart, context.offset, path]);
    let result = this.types.get(key);
    if (!result) { result = this.bind(path, context, true); this.types.set(key, result); }
    return result;
  }
  async typeDeclarations(path: string[], context: SymbolContext): Promise<SymbolLocation[]> {
    const type = await this.type(path, context);
    if (type.status !== 'resolved') return [];
    return type.value.declarations.length ? type.value.declarations : this.at(type.value.path, context, true);
  }
}
