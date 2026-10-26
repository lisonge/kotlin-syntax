import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kotlinFiles } from '../src/workspace-files.ts';

test('workspace enumeration prunes ignored directories and applies nested negations', async () => {
  const directories: Record<string, string[]> = {
    '': ['ignored/', 'build/', '.idea/', '.gradle/', '.kotlin/', '.custom/', 'node_modules/', 'src/', 'Root.kt'],
    'src/': ['ignored/', '.cache/', 'node_modules/', 'dist/', 'nested/', 'Drop.kt', 'Keep.kt'],
    'src/ignored/': ['Visible.kt'],
    'src/nested/': ['Drop.kt', 'Other.kt'],
  };
  const rules: Record<string, string> = {
    '': '/ignored/\nDrop.kt\n!.custom/\n',
    'src/': '*.kt\n!Keep.kt\n',
    'src/nested/': '!Drop.kt\n',
  };
  const visited: string[] = [];
  const access = {
    entries: async (path: string) => {
      visited.push(path);
      assert.ok(directories[path], `Must not traverse excluded directory ${path}`);
      return directories[path].map(name => ({ name: name.replace(/\/$/, ''), directory: name.endsWith('/'), file: !name.endsWith('/') }));
    },
    ignoreFile: async (path: string) => rules[path],
  };
  assert.deepEqual((await kotlinFiles(access, () => false)).sort(), ['Root.kt', 'src/Keep.kt', 'src/nested/Drop.kt']);
  assert.ok(visited.includes('src/ignored/'), 'Root-anchored rule does not exclude a nested namesake');
  visited.length = 0;
  assert.deepEqual(await kotlinFiles(access, () => false, new Set(['src/nested/'])), ['src/nested/Drop.kt']);
  assert.deepEqual(visited, ['', 'src/', 'src/nested/'], 'Directed lookup traverses only package ancestors and applies their ignore rules');
  rules[''] += 'Root.kt\n';
  assert.ok(!(await kotlinFiles(access, () => false)).includes('Root.kt'), 'Rules are refreshed on the next request');
  visited.length = 0;
  assert.deepEqual(await kotlinFiles(access, () => true), []);
  assert.deepEqual(visited, []);
});
