import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';
import { loadConfig } from '../dist/config.mjs';
import { formatCode } from '../dist/kotlin-format.mjs';

const cli = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url));
const raw = 'fun f(){println("😀")}';
const formatted = 'fun f() {\n    println("😀")\n}\n';
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
