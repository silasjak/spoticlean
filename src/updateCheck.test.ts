import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initI18n } from './i18n/index.js';
import { visibleLength } from './ui/terminal.js';
import { buildUpdateNotice, isNewer } from './updateCheck.js';

await initI18n('en');

test('isNewer compares each part numerically, not as text', () => {
  assert.equal(isNewer('1.10.0', '1.9.0'), true);
  assert.equal(isNewer('2.0.0', '1.99.99'), true);
  assert.equal(isNewer('1.1.1', '1.1.0'), true);
});

test('isNewer is false for the same or an older version', () => {
  assert.equal(isNewer('1.1.0', '1.1.0'), false);
  assert.equal(isNewer('1.0.9', '1.1.0'), false);
});

test('isNewer never offers a prerelease or something unparsable', () => {
  assert.equal(isNewer('1.2.0-beta.1', '1.1.0'), false);
  assert.equal(isNewer('latest', '1.1.0'), false);
});

test('the update notice is one evenly wide box', () => {
  const lines = buildUpdateNotice('1.1.0', '1.2.0');
  const width = visibleLength(lines[0]!);
  for (const line of lines) {
    assert.equal(visibleLength(line), width, `line did not match width: ${JSON.stringify(line)}`);
  }
});
