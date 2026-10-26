import assert from 'node:assert/strict';
import { test } from 'node:test';
import { containsName } from '../src/name-filter.ts';

test('name prefilter follows Kotlin identifier boundaries without rejecting escaped names', () => {
  for (const source of ['A', 'A()', '(A)', 'val A = 1', '`A`', 'Account A', '// A', '"A"']) assert.ok(containsName(source, 'A'), source);
  for (const source of ['Account', 'MyA', 'A1', '_A', 'A_', '中A', 'A中', 'A١', '𐐀A', 'A𐐀']) assert.ok(!containsName(source, 'A'), source);
  for (const name of ['a+b', 'a.b', 'two words', '[x]', '中文', '𐐀']) assert.ok(containsName(`val \`${name}\` = 1`, name), name);
  assert.ok(containsName('𐐀A A', 'A'));
  assert.ok(!containsName('anything', ''));
});
