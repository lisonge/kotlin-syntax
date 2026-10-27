import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export interface FormatConfig {
  style?: 'META' | 'GOOGLE' | 'KOTLINLANG';
  maxWidth?: number;
  removeUnusedImports?: boolean;
  preserveLambdaBreaks?: boolean;
}

export async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

export function validateConfig(value: unknown, label = 'configuration'): FormatConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: expected an object`);
  for (const [key, item] of Object.entries(value)) {
    if (key === '$schema' && typeof item === 'string') continue;
    if (key === 'style' && ['META', 'GOOGLE', 'KOTLINLANG'].includes(item as string)) continue;
    if (key === 'maxWidth' && Number.isInteger(item) && item >= 1 && item <= 999) continue;
    if (['removeUnusedImports', 'preserveLambdaBreaks'].includes(key) && typeof item === 'boolean') continue;
    throw new Error(`${label}: invalid option ${key}=${JSON.stringify(item)}`);
  }
  const { style, maxWidth, removeUnusedImports, preserveLambdaBreaks } = value as FormatConfig;
  return Object.fromEntries(Object.entries({ style, maxWidth, removeUnusedImports, preserveLambdaBreaks }).filter(([, v]) => v !== undefined));
}

export async function projectRoot(file: string): Promise<string> {
  let directory = dirname(resolve(file));
  while (true) {
    if (await exists(join(directory, '.git')) || await exists(join(directory, 'package.json'))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return directory;
    directory = parent;
  }
}

/** Nearest config wins; stop at the supplied workspace root or nearest package/Git root. */
export async function loadConfig(file: string, options: { configPath?: string; root?: string; allowCode?: boolean } = {}): Promise<FormatConfig> {
  let path = options.configPath && resolve(options.configPath);
  if (!path) {
    let directory = dirname(resolve(file));
    const root = resolve(options.root ?? await projectRoot(file));
    while (true) {
      const candidates = [];
      for (const name of ['kotlin-format.json', 'kotlin-format.config.js', 'kotlin-format.config.mjs', 'kotlin-format.config.ts']) {
        const candidate = join(directory, name);
        if (await exists(candidate)) candidates.push(candidate);
      }
      if (candidates.length > 1) throw new Error(`${directory}: multiple kotlin-format configurations found`);
      if (candidates.length) { path = candidates[0]; break; }
      const parent = dirname(directory);
      if (directory === root || parent === directory) break;
      directory = parent;
    }
  }
  if (!path) return {};
  try {
    const extension = extname(path);
    if (!['.json', '.js', '.mjs', '.ts'].includes(extension)) throw new Error('expected a .json, .js, .mjs or .ts config');
    if (extension !== '.json' && options.allowCode === false) throw new Error('executable configuration requires a trusted workspace');
    const source = await readFile(path, 'utf8');
    if (extension === '.json') return validateConfig(JSON.parse(source));
    // A content key reloads edited entry modules without creating a new module on every format.
    const url = pathToFileURL(path);
    url.searchParams.set('version', createHash('sha256').update(source).digest('hex'));
    const module = await import(url.href);
    if ('module.exports' in module) throw new Error('CommonJS configuration is not supported; use ESM export default');
    return validateConfig(module.default);
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface ResolvedOptions extends Required<FormatConfig> {
  blockIndent: number;
  continuationIndent: number;
  trailingCommas: string;
}

export function resolveOptions(config: FormatConfig = {}): ResolvedOptions {
  const style = config.style ?? 'KOTLINLANG';
  return {
    style,
    maxWidth: config.maxWidth ?? 100,
    blockIndent: style === 'KOTLINLANG' ? 4 : 2,
    continuationIndent: style === 'GOOGLE' ? 2 : 4,
    trailingCommas: style === 'META' ? 'ONLY_ADD' : 'COMPLETE',
    removeUnusedImports: config.removeUnusedImports ?? true,
    preserveLambdaBreaks: config.preserveLambdaBreaks ?? true,
  };
}
