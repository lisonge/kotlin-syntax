import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';
import { loadConfig } from '../dist/config.mjs';
import { formatCode } from '../dist/kotlin-format.mjs';

const cli = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url));
const raw = 'fun f(){println("😀")}';
const formatted = 'fun f() {\n    println("😀")\n}\n';
const defaultCache = 'node_modules/.cache/kotlin-format/cache.json';
async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'kotlin-format-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'package.json'), '{}');
  return dir;
}
function run(cwd: string, args: string[], input = '', executable = cli) {
  const result = spawnSync(process.execPath, [executable, ...args], { cwd, input, encoding: 'utf8', windowsHide: true });
  assert.ifError(result.error);
  return result;
}

test('persistent cache skips WASM loading and invalidates on content, options and version', async t => {
  const dir = await fixture(t);
  await cp(new URL('../dist/', import.meta.url), join(dir, 'dist'), { recursive: true });
  await cp(new URL('../package.json', import.meta.url), join(dir, 'package.json'));
  const executable = join(dir, 'dist', 'cli.mjs');
  const file = join(dir, 'a.kt');
  await writeFile(file, formatted);
  const args = ['a.kt', '--check', '--cache'];
  assert.equal(run(dir, args, '', executable).status, 0);
  // Remove only this fixture's formatter: a cache hit must not import it.
  await rm(join(dir, 'dist', 'kotlin-format.mjs'));
  await utimes(file, new Date(), new Date());
  assert.equal(run(dir, args, '', executable).status, 0);
  assert.equal(run(dir, ['a.kt', '--write', '--cache'], '', executable).status, 0);
  const cached = await readFile(join(dir, defaultCache), 'utf8');
  assert.equal(run(dir, [...args, '--max-width', '40'], '', executable).status, 2);
  await writeFile(join(dir, defaultCache), cached);
  await writeFile(join(dir, 'kotlin-format.json'), '{"maxWidth":40}');
  assert.equal(run(dir, args, '', executable).status, 2);
  await rm(join(dir, 'kotlin-format.json'));
  await writeFile(join(dir, defaultCache), cached);
  const info = await stat(file);
  await writeFile(file, formatted.replace('println', 'printLn'));
  await utimes(file, info.atime, info.mtime);
  assert.equal(run(dir, args, '', executable).status, 2);
  await writeFile(file, formatted);
  await writeFile(join(dir, defaultCache), cached);
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ ...pkg, version: '0.0.0-test' }));
  assert.equal(run(dir, args, '', executable).status, 2);
});

test('cache preserves check failures and upstream non-idempotence after writing', async t => {
  const dir = await fixture(t);
  const file = join(dir, 'a.kt');
  const cachePath = join(dir, '.cache', 'format.json');
  const flags = ['--cache', '--cache-location', cachePath, '--max-width', '49'];
  const source = 'fun f() {\n  @Annotation // test a comment after annotations\n  return 5\n}';
  await writeFile(file, source);
  assert.equal(run(dir, ['a.kt', '--write', ...flags]).status, 0);
  const first = await readFile(file, 'utf8');
  assert.deepEqual(JSON.parse(await readFile(cachePath, 'utf8')).entries, {});
  for (let i = 0; i < 2; i++) assert.equal(run(dir, ['a.kt', '--check', ...flags]).status, 1);
  assert.equal(run(dir, ['a.kt', '--write', ...flags]).status, 0);
  assert.notEqual(await readFile(file, 'utf8'), first);
  await writeFile(file, formatted);
  assert.equal(run(dir, ['a.kt', '--check', ...flags]).status, 0);
  const cached = await readFile(cachePath, 'utf8');
  assert.equal(run(dir, ['a.kt', '--check']).status, 0);
  assert.equal(await readFile(cachePath, 'utf8'), cached);
  assert.equal(run(dir, ['a.kt', ...flags]).stdout, formatted);
  assert.equal(run(dir, flags, raw).stdout, formatted);
  await writeFile(file, 'fun {');
  assert.equal(run(dir, ['a.kt', '--check', ...flags]).status, 2);
  assert.deepEqual(JSON.parse(await readFile(cachePath, 'utf8')).entries, {});
});

test('cached formatting repairs restored original content before and after warming the cache', async t => {
  const dir = await fixture(t);
  const file = join(dir, 'a.kt');
  for (const warmCache of [false, true]) {
    await writeFile(file, raw);
    const first = run(dir, ['a.kt', '--write', '--cache']);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(await readFile(file, 'utf8'), formatted);
    if (warmCache) {
      const checked = run(dir, ['a.kt', '--check', '--cache']);
      assert.equal(checked.status, 0, checked.stderr);
    }
    await writeFile(file, raw);
    // Go directly back to write: a check here could clear an incorrect cache entry.
    const restored = run(dir, ['a.kt', '--write', '--cache']);
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(restored.stdout, `${file}\n`);
    assert.equal(await readFile(file, 'utf8'), formatted);
  }
});

test('cached formatting isolates sibling directory configurations', async t => {
  const dir = await fixture(t);
  const left = join(dir, 'left', 'a.kt');
  const right = join(dir, 'right', 'a.kt');
  for (const name of ['left', 'right']) await mkdir(join(dir, name));
  await writeFile(join(dir, 'left', 'kotlin-format.json'), '{"style":"KOTLINLANG"}');
  await writeFile(join(dir, 'right', 'kotlin-format.json'), '{"style":"GOOGLE"}');
  await writeFile(left, raw);
  await writeFile(right, raw);
  const twoSpaces = formatted.replace('    ', '  ');
  const written = run(dir, ['.', '--write', '--cache']);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(await readFile(left, 'utf8'), formatted);
  assert.equal(await readFile(right, 'utf8'), twoSpaces);
  const checked = run(dir, ['.', '--check', '--cache']);
  assert.equal(checked.status, 0, checked.stderr);
  const before = JSON.parse(await readFile(join(dir, defaultCache), 'utf8')).entries;
  assert.equal(typeof before[left], 'string');
  assert.equal(typeof before[right], 'string');

  await writeFile(join(dir, 'right', 'kotlin-format.json'), '{"style":"KOTLINLANG"}');
  const changed = run(dir, ['.', '--check', '--cache']);
  assert.equal(changed.status, 1, changed.stderr);
  assert.equal(changed.stdout, `${right}\n`);
  const after = JSON.parse(await readFile(join(dir, defaultCache), 'utf8')).entries;
  assert.equal(after[left], before[left]);
  assert.equal(after[right], undefined);
  const repaired = run(dir, ['.', '--write', '--cache']);
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.equal(repaired.stdout, `${right}\n`);
  assert.equal(await readFile(left, 'utf8'), formatted);
  assert.equal(await readFile(right, 'utf8'), formatted);
  assert.equal(run(dir, ['.', '--check', '--cache']).status, 0);
});

test('CLI config reuse respects inherited configs, package boundaries and explicit overrides', async t => {
  const dir = await fixture(t);
  await writeFile(join(dir, 'kotlin-format.json'), '{"style":"GOOGLE"}');
  const paths = ['src/a.kt', 'src/b.kt', 'other/a.kt', 'module/src/a.kt', 'module/src/b.kt'];
  for (const directory of ['src', 'other', 'module/src']) await mkdir(join(dir, directory), { recursive: true });
  await writeFile(join(dir, 'module', 'package.json'), '{}');
  for (const path of paths) await writeFile(join(dir, path), raw);
  const first = run(dir, ['--write', ...paths]);
  assert.equal(first.status, 0, first.stderr);
  for (const path of paths) {
    assert.equal(await readFile(join(dir, path), 'utf8'), path.startsWith('module/') ? formatted : formatted.replace('    ', '  '));
  }
  // A subsequent invocation must discover a config added after the previous run.
  await writeFile(join(dir, 'module', 'kotlin-format.json'), '{"style":"GOOGLE"}');
  const second = run(dir, ['--write', ...paths]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, ['module/src/a.kt', 'module/src/b.kt'].map(p => `${join(dir, p)}\n`).join(''));
  await writeFile(join(dir, 'override.json'), '{"style":"KOTLINLANG"}');
  const overridden = run(dir, ['--write', '--config', 'override.json', ...paths]);
  assert.equal(overridden.status, 0, overridden.stderr);
  for (const path of paths) assert.equal(await readFile(join(dir, path), 'utf8'), formatted);
});

test('shared invalid directory configuration reports each affected file and continues other directories', async t => {
  const dir = await fixture(t);
  await mkdir(join(dir, 'bad'));
  await writeFile(join(dir, 'bad', 'kotlin-format.json'), '{"style":"BAD"}');
  for (const path of ['bad/a.kt', 'bad/b.kt', 'good.kt']) await writeFile(join(dir, path), raw);
  const result = run(dir, ['--write']);
  assert.equal(result.status, 2);
  for (const path of ['bad/a.kt', 'bad/b.kt']) {
    assert.ok(result.stderr.includes(`${join(dir, path)}:`));
    assert.equal(await readFile(join(dir, path), 'utf8'), raw);
  }
  assert.equal(await readFile(join(dir, 'good.kt'), 'utf8'), formatted);
});

test('built CLI supports stdin, scripts, unicode, line endings, help and version', async t => {
  const dir = await fixture(t);
  assert.equal(run(dir, [], raw).stdout, formatted);
  assert.equal(run(dir, ['--stdin-filepath', 'test.kts'], 'println(1+2)').stdout, 'println(1 + 2)\n');
  assert.equal(run(dir, ['-'], 'fun f(){\r\nprintln(1)\r\n}').stdout, 'fun f() {\r\n    println(1)\r\n}\r\n');
  assert.equal(run(dir, ['--help']).status, 0);
  assert.match(run(dir, ['--help']).stdout, /--max-width/);
  assert.equal(run(dir, ['--version']).stdout.trim(), JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version);
  assert.equal(run(dir, ['--check', '--stdin-filepath', 'a.kt'], raw).status, 1);
  assert.equal(run(dir, ['--check', '--stdin-filepath', 'a.kt'], formatted).status, 0);
});

test('write/check/glob traversal respects nested gitignore and preserves non-Kotlin files', async t => {
  const dir = await fixture(t);
  await mkdir(join(dir, 'src'));
  await mkdir(join(dir, 'generated'));
  await writeFile(join(dir, '.gitignore'), 'generated/\n*.skip.kt\n');
  await writeFile(join(dir, 'src', '.gitignore'), '!keep.skip.kt\n');
  for (const name of ['src/a.kt', 'src/b.kts', 'src/drop.skip.kt', 'src/keep.skip.kt', 'generated/a.kt', 'readme.txt']) await writeFile(join(dir, name), 'val a=1');
  assert.equal(run(dir, ['.', '--check']).status, 1);
  const written = run(dir, ['**/*', '--write']);
  assert.equal(written.status, 0, written.stderr);
  for (const name of ['src/a.kt', 'src/b.kts', 'src/keep.skip.kt']) assert.equal(await readFile(join(dir, name), 'utf8'), 'val a = 1\n');
  for (const name of ['src/drop.skip.kt', 'generated/a.kt', 'readme.txt']) assert.equal(await readFile(join(dir, name), 'utf8'), 'val a=1');
  assert.equal(run(dir, ['--check']).status, 0);
  assert.equal(run(dir, ['src/a.kt']).stdout, 'val a = 1\n');
  assert.equal(run(dir, ['src', '--write']).stdout, '');
});

test('nearest module configuration, explicit configuration, overrides and edits', async t => {
  const dir = await fixture(t);
  await mkdir(join(dir, 'src'));
  await writeFile(join(dir, 'kotlin-format.json'), '{"style":"GOOGLE","maxWidth":80}');
  await writeFile(join(dir, 'src', 'kotlin-format.config.mjs'), 'export default { // nested\n style: "META", removeUnusedImports: false, };');
  const file = join(dir, 'src', 'a.kt');
  const source = 'import unused.Foo\n' + raw;
  const result = run(dir, ['--stdin-filepath', file], source);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /import unused.Foo/);
  assert.match(result.stdout, /\n  println/);
  const overridden = run(dir, ['--stdin-filepath', file, '--style', 'KOTLINLANG', '--remove-unused-imports'], source);
  assert.equal(overridden.stdout, formatted);
  assert.equal(run(dir, ['--config', 'kotlin-format.json'], raw).stdout, formatted.replace('    ', '  '));
  assert.deepEqual(await loadConfig(file), { style: 'META', removeUnusedImports: false });
  await writeFile(join(dir, 'src', 'kotlin-format.config.mjs'), 'export default {maxWidth:40};');
  assert.deepEqual(await loadConfig(file), { maxWidth: 40 }, 'config edits are not cached');
  await writeFile(join(dir, 'src', 'package.json'), '{}');
  await rm(join(dir, 'src', 'kotlin-format.config.mjs'));
  assert.deepEqual(await loadConfig(file), {}, 'nearest package boundary stops discovery');
});

test('invalid arguments/config/source return exit 2 and never rewrite failed input', async t => {
  const dir = await fixture(t);
  await writeFile(join(dir, 'a.kt'), 'fun {');
  for (const args of [['--unknown'], ['--write', '--check'], ['--max-width', '0'], ['--max-width', '1000'], ['--style', 'BAD'], ['--config', 'missing.json'], ['--write', '--stdin-filepath', 'a.kt'], ['missing*.kt', '--check'], ['a.kt', '--write']]) {
    const result = run(dir, args, raw);
    assert.equal(result.status, 2, JSON.stringify({ args, ...result }));
    assert.ok(result.stderr);
  }
  assert.equal(await readFile(join(dir, 'a.kt'), 'utf8'), 'fun {');
  for (const config of ['{"maxWidth":"80"}', '{"unknown":true}', '{"style":"GOOGLE",}', '[]', '{ /* comment */ }']) {
    await writeFile(join(dir, 'kotlin-format.json'), config);
    assert.equal(run(dir, [], raw).status, 2, config);
  }
  await writeFile(join(dir, 'kotlin-format.json'), '{}');
  await writeFile(join(dir, 'kotlin-format.config.js'), 'module.exports = {};');
  assert.equal(run(dir, [], raw).status, 2, 'ambiguous configs');
});

test('native ESM JS, MJS and TS configs load and reload', async t => {
  for (const [extension, type] of [['js', 'module'], ['mjs', 'commonjs'], ['ts', 'module']] as const) {
    const dir = await fixture(t);
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type }));
    const file = join(dir, 'a.kt');
    const config = join(dir, `kotlin-format.config.${extension}`);
    const code = (width: number) => extension === 'ts' ? `const width: number = ${width}; export default { maxWidth: width, style: 'GOOGLE' as const };`
        : `export default { maxWidth: ${width}, style: 'GOOGLE' };`;
    await writeFile(config, code(80));
    assert.deepEqual(await loadConfig(file), { maxWidth: 80, style: 'GOOGLE' });
    assert.equal(run(dir, [], raw).stdout, formatted.replace('    ', '  '));
    await writeFile(config, code(40));
    assert.deepEqual(await loadConfig(file), { maxWidth: 40, style: 'GOOGLE' });
    await writeFile(config, code(80));
    assert.deepEqual(await loadConfig(file), { maxWidth: 80, style: 'GOOGLE' });
    await assert.rejects(loadConfig(file, { allowCode: false }), /trusted workspace/);
  }
});

test('CommonJS configurations are rejected', async t => {
  const dir = await fixture(t);
  await writeFile(join(dir, 'package.json'), '{"type":"commonjs"}');
  for (const extension of ['js', 'ts', 'cjs']) {
    const configPath = join(dir, `config.${extension}`);
    await writeFile(configPath, 'module.exports = { maxWidth: 80 };');
    await assert.rejects(loadConfig(join(dir, 'a.kt'), { configPath }), extension === 'cjs' ? /expected a/ : /CommonJS configuration is not supported/);
    assert.equal(run(dir, ['--config', configPath], raw).status, 2);
  }
});

test('module configs resolve relative imports and reject unsupported formats or exports', async t => {
  const dir = await fixture(t);
  const file = join(dir, 'a.kt');
  await writeFile(join(dir, 'options.mjs'), 'export const width = 60;');
  const config = join(dir, 'kotlin-format.config.mjs');
  await writeFile(config, 'import { width } from "./options.mjs"; export default { maxWidth: width };');
  assert.deepEqual(await loadConfig(file), { maxWidth: 60 });
  for (const source of ['export const maxWidth = 80;', 'export default () => ({});', 'throw new Error("broken config");']) {
    await writeFile(config, source);
    assert.equal(run(dir, [], raw).status, 2);
  }
  await rm(config);
  await writeFile(join(dir, 'old.jsonc'), '{}');
  assert.equal(run(dir, ['--config', 'old.jsonc'], raw).status, 2);
  await writeFile(join(dir, 'kotlin-format.json'), '{"maxWidth":80}');
  assert.deepEqual(await loadConfig(file, { allowCode: false }), { maxWidth: 80 });
});

test('release layout runs without node_modules or Gradle', async t => {
  const dir = await fixture(t);
  await cp(new URL('../dist/', import.meta.url), join(dir, 'dist'), { recursive: true });
  await cp(new URL('../package.json', import.meta.url), join(dir, 'package.json'));
  const result = run(dir, [], raw, join(dir, 'dist', 'cli.mjs'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, formatted);
});

test('one invocation performs one upstream pass, preserving known non-idempotence', async t => {
  const dir = await fixture(t);
  const source = 'fun f() {\n  @Annotation // test a comment after annotations\n  return 5\n}';
  const first = run(dir, ['--max-width', '49'], source);
  const second = run(dir, ['--max-width', '49'], first.stdout);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.notEqual(first.stdout, second.stdout);
  assert.equal(run(dir, ['--check', '--stdin-filepath', 'a.kt', '--max-width', '49'], first.stdout).status, 1);
});

test('all CLI styles and output widths match the existing WASM entry', async t => {
  const dir = await fixture(t);
  const source = 'fun example(){someCall(firstArgument, secondArgument, thirdArgument, fourthArgument)}';
  for (const style of ['KOTLINLANG', 'GOOGLE', 'META']) {
    for (const width of [40, 120]) {
      const result = run(dir, ['--style', style, '--max-width', String(width)], source);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, formatCode(source, style, width, false));
    }
  }
  assert.notEqual(run(dir, ['--max-width', '40'], source).stdout, run(dir, ['--max-width', '120'], source).stdout);
});
