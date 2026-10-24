import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenStyle as resolveStyle } from '../scripts/resolve-theme.ts';
import { tokenClass, tokenStyle, tokenRules } from '../src/token-theme.ts';
import { tokenTypes, tokenModifiers } from 'kotlin-parser/shared';

test('One Dark Pro semantic overrides and VS Code scope fallbacks', () => {
  // Independent expectations from the pinned official theme and VS Code probes.
  assert.equal(tokenStyle('enumMember').color, '#56b6c2');
  assert.equal(tokenStyle('operator').color, '#abb2bf');
  assert.equal(tokenStyle('class').color, '#e5c07b');
  assert.equal(tokenStyle('function').color, '#61afef');
  assert.equal(tokenStyle('string').color, '#98c379');
  assert.equal(tokenStyle('number').color, '#d19a66');
  assert.equal(tokenStyle('keyword').color, '#c678dd');
  assert.equal(tokenStyle('comment').fontStyle, 'italic');
  assert.equal(tokenStyle('parameter').fontStyle, 'italic');
  assert.equal(tokenStyle('label').color, '#abb2bf');
});

test('readonly and language-specific selectors do not lose modifier information', () => {
  const readonly = 1 << tokenModifiers.indexOf('readonly');
  assert.equal(tokenStyle('variable').color, '#e06c75');
  assert.equal(tokenStyle('variable', readonly).color, '#e5c07b');
  assert.equal(tokenStyle('property', readonly).color, '#e06c75');
  // Dart-specific property rules must not leak into Kotlin.
  assert.notEqual(tokenStyle('property').color, '#d19a66');
});

test('every parser token and modifier combination has a decoration style', () => {
  assert.equal(tokenTypes.length, 19);
  assert.equal(tokenModifiers.length, 5);
  for (const type of tokenTypes) for (let bits = 0; bits < 32; bits++) {
    assert.deepEqual(tokenRules[`.${tokenClass(type, bits)}`], resolveStyle(type, bits));
  }
});
