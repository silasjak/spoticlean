import assert from 'node:assert/strict';
import { test } from 'node:test';

import { estimateChorusPositionMs, isLoadedOn } from './playback.js';
import type { PlaybackState } from './types.js';

const URI = 'spotify:track:next';
const DEVICE = 'macbook';

function stateWith(uri: string, deviceId: string, isPlaying = true): NonNullable<PlaybackState> {
  return {
    device: { id: deviceId, name: 'MacBook', type: 'Computer', is_active: true, is_restricted: false, volume_percent: 50 },
    is_playing: isPlaying,
    progress_ms: 0,
    item: { uri } as NonNullable<PlaybackState>['item'],
  };
}

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

test('isLoadedOn: the track on the chosen device counts, even while still buffering', () => {
  assert.equal(isLoadedOn(stateWith(URI, DEVICE), URI, DEVICE), true);
  assert.equal(isLoadedOn(stateWith(URI, DEVICE, false), URI, DEVICE), true);
});

test('isLoadedOn: no state, the previous track or another device all mean "not arrived"', () => {
  assert.equal(isLoadedOn(null, URI, DEVICE), false);
  assert.equal(isLoadedOn(stateWith('spotify:track:previous', DEVICE), URI, DEVICE), false);
  assert.equal(isLoadedOn(stateWith(URI, 'echo-dot'), URI, DEVICE), false);
});
