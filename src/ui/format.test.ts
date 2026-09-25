import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatArtists, formatDuration } from './format.js';
import type { SpotifyTrack } from '../spotify/types.js';

test('formatDuration pads seconds under 10', () => {
  assert.equal(formatDuration(65_000), '1:05');
});

test('formatDuration handles durations under a minute', () => {
  assert.equal(formatDuration(9_000), '0:09');
});

test('formatDuration rounds to the nearest second', () => {
  assert.equal(formatDuration(59_700), '1:00');
});

test('formatArtists joins multiple artists with a comma', () => {
  const track = { artists: [{ name: 'A' }, { name: 'B' }] } as SpotifyTrack;
  assert.equal(formatArtists(track), 'A, B');
});
