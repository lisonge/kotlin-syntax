import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const manifest = JSON.parse(await readFile(new URL('../kotlin-format/package.json', import.meta.url), 'utf8'));
const archive = resolve(`build/kotlin-format-${manifest.version}.tgz`);
const directory = await mkdtemp(join(tmpdir(), 'kotlin-format-release-'));
try {
  const extracted = spawnSync('tar', ['-xzf', archive, '-C', directory], { encoding: 'utf8', windowsHide: true });
  assert.ifError(extracted.error);
  assert.equal(extracted.status, 0, extracted.stderr);
  const packaged = JSON.parse(await readFile(join(directory, 'package/package.json'), 'utf8'));
  assert.equal(packaged.version, manifest.version);
  assert.equal(packaged.name, 'kotlin-format');
  assert.notEqual(packaged.private, true);
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const version of Object.values(packaged[section] ?? {})) assert.doesNotMatch(String(version), /^(catalog|workspace):/);
  }
  const cli = join(directory, 'package', packaged.bin['kotlin-format']);
  const version = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8', windowsHide: true });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), manifest.version);
  const formatted = spawnSync(process.execPath, [cli, '--stdin-filepath', 'example.kt'], {
    cwd: directory, input: 'fun f(){println(1)}', encoding: 'utf8', windowsHide: true,
  });
  assert.equal(formatted.status, 0, formatted.stderr);
  assert.equal(formatted.stdout, 'fun f() {\n    println(1)\n}\n');
  console.log(`Verified release archive ${archive}: manifest, CLI version and standalone formatting`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
