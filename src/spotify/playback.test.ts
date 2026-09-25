import assert from 'node:assert/strict';
import { test } from 'node:test';

import { estimateChorusPositionMs } from './playback.js';

test('starts short tracks (< 60s) from the beginning', () => {
  assert.equal(estimateChorusPositionMs(45_000), 0);
});

test('estimates ~40% in for a typical song length', () => {
  const threeMinutes = 180_000;
  assert.equal(estimateChorusPositionMs(threeMinutes), 72_000);
});

test('never returns a negative or NaN position', () => {
  assert.equal(estimateChorusPositionMs(0), 0);
  assert.ok(Number.isFinite(estimateChorusPositionMs(600_000)));
});
