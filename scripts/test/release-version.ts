import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseVersions } from '../release-version.ts';

test('release requires matching stable package versions and tag', () => {
  validateReleaseVersions('0.0.7', '0.0.7', '0.0.7', 'v0.0.7');
  for (const [extension, formatter, parser, tag] of [
    ['0.0.7', '0.0.6', '0.0.7', 'v0.0.7'], ['0.0.7', '0.0.7', '0.0.6', 'v0.0.7'],
    ['0.0.7', '0.0.7', '0.0.7', 'v0.0.8'], ['0.0.7', '0.0.7', '0.0.7', undefined],
    ['0.0.7-beta.1', '0.0.7-beta.1', '0.0.7-beta.1', 'v0.0.7-beta.1'],
  ]) assert.throws(() => validateReleaseVersions(extension!, formatter!, parser!, tag), /must match/);
});
