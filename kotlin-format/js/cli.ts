#!/usr/bin/env node
import { glob, lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import ignore from 'ignore';
import { exists, loadConfig, projectRoot, resolveOptions, validateConfig, type FormatConfig } from './config.ts';

const help = `Usage: kotlin-format [files/directories/globs...] [options]

  --write                       Format files in place
  --check                       Report files that need formatting (exit 1)
  --stdin-filepath <file.kt>     Format stdin; use this path for config and .kts
  --config <path>               Use an explicit JSON/JS/MJS/TS config
  --style <KOTLINLANG|GOOGLE|META>
  --max-width <1..999>
  --remove-unused-imports / --no-remove-unused-imports
  --preserve-lambda-breaks / --no-preserve-lambda-breaks
  --help, -h                    Show help
  --version, -v                 Show version

Without --write/--check, a single file (or stdin) is formatted to stdout.
With --write/--check and no paths, scan the current directory.
Directories scan .kt/.kts files and respect .gitignore; symlinks are skipped.
Exit codes: 0 success, 1 formatting required, 2 invalid input/config or failure.
`;

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, allowNegative: true, options: {
    write: { type: 'boolean' }, check: { type: 'boolean' },
    'stdin-filepath': { type: 'string' }, config: { type: 'string' },
    style: { type: 'string' }, 'max-width': { type: 'string' },
    'remove-unused-imports': { type: 'boolean' }, 'preserve-lambda-breaks': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
  } });
  if (values.help) { process.stdout.write(help); return; }
  if (values.version) {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${pkg.version}\n`); return;
  }
  if (values.write && values.check) throw new Error('--write and --check cannot be combined');
  const overrides: Record<string, unknown> = {};
  for (const [flag, key] of [['style', 'style'], ['max-width', 'maxWidth'], ['remove-unused-imports', 'removeUnusedImports'], ['preserve-lambda-breaks', 'preserveLambdaBreaks']] as const) {
    if (values[flag] !== undefined) overrides[key] = flag === 'max-width' ? Number(values[flag]) : values[flag];
  }
  const cliConfig = validateConfig(overrides, 'arguments');
  const stdin = values['stdin-filepath'] !== undefined || positionals.includes('-') || (!positionals.length && !values.write && !values.check);
  if (stdin && (positionals.some(p => p !== '-') || positionals.length > 1 || values.write)) throw new Error('stdin cannot be combined with file paths or --write');
  if (stdin && process.stdin.isTTY) throw new Error('Provide a file path or pipe source to stdin');

  const { formatWithOptions } = await import('../dist/kotlin-format.mjs');
  async function format(source: string, file: string) {
    const config: FormatConfig = { ...await loadConfig(file, { configPath: values.config }), ...cliConfig };
    const o = resolveOptions(config);
    return formatWithOptions(source, o.maxWidth, o.blockIndent, o.continuationIndent, o.trailingCommas,
      o.removeUnusedImports, o.preserveLambdaBreaks, file.endsWith('.kts'));
  }
  if (stdin) {
    const file = resolve(values['stdin-filepath'] ?? 'stdin.kt');
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const source = Buffer.concat(chunks).toString('utf8');
    const result = await format(source, file);
    if (values.check) { if (source !== result) { process.stdout.write(`${file}\n`); process.exitCode = 1; } }
    else process.stdout.write(result);
    return;
  }

  const files = new Set<string>();
  const ignoreCache = new Map<string, ReturnType<typeof ignore>>();
  async function ignored(path: string, directory: boolean) {
    const root = await projectRoot(path);
    const parts = relative(root, path).split(sep);
    let current = root;
    const inherited: { base: string; rules: ReturnType<typeof ignore> }[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (['.git', 'node_modules'].includes(parts[i])) return true;
      let rules = ignoreCache.get(current);
      if (!rules) {
        rules = ignore();
        const config = join(current, '.gitignore');
        if (await exists(config)) rules.add(await readFile(config, 'utf8'));
        ignoreCache.set(current, rules);
      }
      inherited.push({ base: current, rules });
      current = join(current, parts[i]);
      let excluded = false;
      for (const entry of inherited) {
        const result = entry.rules.test(relative(entry.base, current).split(sep).join('/') + (i < parts.length - 1 || directory ? '/' : ''));
        if (result.ignored) excluded = true;
        else if (result.unignored) excluded = false;
      }
      if (excluded) return true;
    }
    return false;
  }
  async function visit(path: string) {
    const info = await lstat(path);
    if (info.isSymbolicLink() || await ignored(path, info.isDirectory())) return;
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(join(path, name));
    } else if (info.isFile() && ['.kt', '.kts'].includes(extname(path))) files.add(path);
  }
  for (const input of positionals.length ? positionals : ['.']) {
    if (await exists(resolve(input))) await visit(resolve(input));
    else {
      let matched = false;
      for await (const path of glob(input)) { matched = true; await visit(resolve(path)); }
      if (!matched) throw new Error(`No files match: ${input}`);
    }
  }
  if (!files.size) throw new Error('No Kotlin files found');
  if (!values.write && !values.check && files.size !== 1) throw new Error('Use --write or --check for multiple files');
  for (const file of [...files].sort()) {
    try {
      const source = await readFile(file, 'utf8');
      const result = await format(source, file);
      if (values.write) {
        if (source !== result) { await writeFile(file, result); process.stdout.write(`${file}\n`); }
      } else if (values.check) {
        if (source !== result) { process.stdout.write(`${file}\n`); process.exitCode ||= 1; }
      } else process.stdout.write(result);
    } catch (error) {
      process.stderr.write(`${file}: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    }
  }
}

main().catch(error => {
  process.stderr.write(`kotlin-format: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
