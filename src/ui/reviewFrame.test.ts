import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TrackItem } from '../spotify/types.js';
import { visibleLength } from './terminal.js';
import { buildReviewFrame, type LogLine } from './reviewFrame.js';

function makeItem(overrides: Partial<TrackItem['track']> = {}): TrackItem {
  return {
    added_at: '2026-01-02T00:00:00Z',
    track: {
      id: '1',
      uri: 'spotify:track:1',
      name: 'Ein Song',
      duration_ms: 180_000,
      artists: [{ name: 'Ein Artist' }],
      album: { name: 'Ein Album', images: [] },
      preview_url: null,
      is_local: false,
      ...overrides,
    },
  };
}

function baseState(overrides: Partial<Parameters<typeof buildReviewFrame>[0]> = {}) {
  return {
    sourceName: 'Liked Songs',
    trackNumber: 1,
    totalTracks: 100,
    item: makeItem(),
    hasDevice: true,
    positionMs: 0,
    isPaused: false,
    log: [] as LogLine[],
    width: 80,
    height: 24,
    ...overrides,
  };
}

test('every line has exactly the requested visible width', () => {
  const frame = buildReviewFrame(baseState());
  for (const line of frame) {
    assert.equal(visibleLength(line), 80, `line did not match width: ${JSON.stringify(line)}`);
  }
});

test('never emits more lines than the terminal has rows, once the terminal is tall enough for header+card+footer', () => {
  // Below that fixed minimum (header/card/footer with no history at all),
  // there's nothing left to shrink — accept the overflow there, since a
  // terminal that short is not a realistic case; paintFrame's own slice()
  // is the last-resort safety net for it.
  const minimum = buildReviewFrame(baseState({ height: 0, log: [] })).length;
  for (const height of [minimum, minimum + 1, 24, 40]) {
    const frame = buildReviewFrame(baseState({ height }));
    assert.ok(frame.length <= height, `height=${height} produced ${frame.length} lines`);
  }
});

test('degenerately small terminals do not throw or grow unbounded', () => {
  const minimum = buildReviewFrame(baseState({ height: 0, log: [] })).length;
  for (const height of [3, 1, 0, -5]) {
    const frame = buildReviewFrame(baseState({ height }));
    assert.equal(frame.length, minimum);
  }
});

test('history grows to fill the space left after header/card/footer', () => {
  const log: LogLine[] = Array.from({ length: 50 }, (_, i) => ({ text: `Song ${i}` }));
  const short = buildReviewFrame(baseState({ height: 15, log }));
  const tall = buildReviewFrame(baseState({ height: 40, log }));
  assert.ok(tall.length > short.length);
  assert.ok(tall.length <= 40);
});

test('shows a placeholder when nothing has been decided yet', () => {
  const frame = buildReviewFrame(baseState({ log: [] })).join('\n');
  assert.match(frame, /Noch keine Entscheidungen/);
});

test('omits the "Verlauf" section entirely rather than pushing the footer off-screen', () => {
  const minimum = buildReviewFrame(baseState({ height: 0, log: [] })).length;
  const frame = buildReviewFrame(baseState({ height: minimum, log: [{ text: 'x' }] }));
  assert.doesNotMatch(frame.join('\n'), /Verlauf/);
  // The footer (key legend) must still be the last thing on screen.
  assert.match(frame.at(-1) ?? '', /└/);
});

test('hides playback-only key hints and the position line without a device', () => {
  const withDevice = buildReviewFrame(baseState({ hasDevice: true })).join('\n');
  const withoutDevice = buildReviewFrame(baseState({ hasDevice: false })).join('\n');
  assert.match(withDevice, /pause/);
  assert.doesNotMatch(withoutDevice, /pause/);
  assert.doesNotMatch(withoutDevice, /▶|⏸/);
});

test('wraps the key legend onto more lines on a narrow terminal', () => {
  const wide = buildReviewFrame(baseState({ width: 120 }));
  const narrow = buildReviewFrame(baseState({ width: 40 }));
  for (const line of narrow) assert.equal(visibleLength(line), 40);
  // Narrower terminals need more (shorter) footer lines to fit the same hints.
  assert.ok(narrow.length >= wide.length);
});

test('truncates a very long track/album name instead of overflowing the box', () => {
  const item = makeItem({ name: 'X'.repeat(500), album: { name: 'Y'.repeat(500), images: [] } });
  const frame = buildReviewFrame(baseState({ item, width: 50 }));
  for (const line of frame) assert.equal(visibleLength(line), 50);
});

test('handles a missing track (index past the end) without throwing', () => {
  assert.doesNotThrow(() => buildReviewFrame(baseState({ item: undefined })));
});
