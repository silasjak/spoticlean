import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initI18n } from '../i18n/index.js';
import type { SpotifyTrack, TrackItem } from '../spotify/types.js';
import { buildInfoFrame, coverColumnsFor, type InfoFrameState } from './infoFrame.js';
import { visibleLength } from './terminal.js';

// Asserts the German copy, like reviewFrame.test.ts.
await initI18n('de');

// eslint-disable-next-line no-control-regex -- deliberately matching the ESC control character to strip ANSI color codes
const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');

function makeItem(overrides: Partial<SpotifyTrack> = {}): TrackItem {
  return {
    added_at: '2026-10-31T15:22:41Z',
    track: {
      id: 'abc',
      uri: 'spotify:track:abc',
      name: 'Forever Young',
      duration_ms: 226_706,
      artists: [{ name: 'Alphaville' }],
      album: { name: 'Forever Young', images: [], album_type: 'album', release_date: '1984-09-27', total_tracks: 10 },
      track_number: 6,
      preview_url: null,
      is_local: false,
      ...overrides,
    },
  };
}

const idle = { track: undefined, hasDevice: false, isPaused: false, positionMs: 0 };

function frame(overrides: Partial<InfoFrameState> = {}): string[] {
  return buildInfoFrame({
    sourceName: 'Lieblingssongs',
    item: makeItem(),
    trackNumber: 3,
    totalTracks: 233,
    reviewTrackNumber: 5,
    nowPlaying: { track: makeItem().track, hasDevice: true, isPaused: false, positionMs: 60_000 },
    cover: 'loading',
    width: 100,
    height: 30,
    ...overrides,
  });
}

test('every line fills exactly the terminal width, wide or narrow', () => {
  for (const [width, height] of [
    [100, 30],
    [60, 40],
    [40, 12],
  ] as const) {
    for (const line of frame({ width, height })) assert.equal(visibleLength(line), width, `${width}×${height}`);
  }
});

test('shows the details next to the cover on a wide terminal', () => {
  const text = frame().map(stripAnsi);
  const titleRow = text.find((line) => line.includes('Forever Young') && line.includes('░'));
  assert.ok(titleRow, 'title shares a row with the cover placeholder');
  assert.ok(text.some((line) => line.includes('Erschienen') && line.includes('Album · 1984')));
  assert.ok(text.some((line) => line.includes('6 von 10')));
  assert.ok(text.some((line) => line.includes('3 von 233 in Lieblingssongs')));
  assert.ok(text.some((line) => line.includes('noch offen')));
  assert.ok(text.some((line) => line.includes('open.spotify.com/track/abc')));
});

test('stacks the details under the cover on a narrow terminal', () => {
  // No playback, so the only ░ on screen are the cover placeholder's (the progress bar uses them too)
  const text = frame({ width: 60, height: 40, nowPlaying: idle }).map(stripAnsi);
  const coverRows = text.filter((line) => line.includes('░'));
  assert.ok(coverRows.length > 0);
  assert.ok(!coverRows.some((line) => line.includes('Forever Young')));
  const lastCover = text.lastIndexOf(coverRows.at(-1)!);
  assert.ok(text.findIndex((line) => line.includes('Alphaville')) > lastCover);
});

test('the cover placeholder says it is loading, or that there is none', () => {
  assert.ok(frame().map(stripAnsi).some((line) => line.includes('Cover lädt')));
  assert.ok(frame({ cover: 'none' }).map(stripAnsi).some((line) => line.includes('kein Cover')));
});

test('names the decision of an already-reviewed track', () => {
  assert.ok(frame({ decision: 'removed' }).map(stripAnsi).some((line) => line.includes('✗ entfernt')));
  assert.ok(frame({ decision: 'kept' }).map(stripAnsi).some((line) => line.includes('✓ behalten')));
});

test('leaves the cover out entirely when there is no room for a recognizable one', () => {
  assert.equal(coverColumnsFor(30, 10), 0);
  assert.ok(!frame({ width: 30, height: 10, nowPlaying: idle }).map(stripAnsi).some((line) => line.includes('░')));
});

test('keeps the review header, one level deeper', () => {
  const top = stripAnsi(frame()[0]!);
  assert.ok(top.includes('Lieblingssongs · Track 5/233 › Song-Info'), top);
});

test('shows what is playing underneath, naming it only when it is not the shown track', () => {
  const own = frame().map(stripAnsi);
  assert.ok(own.some((line) => line.includes('▶ 1:00')));

  const other = { ...makeItem().track, uri: 'spotify:track:other', name: 'Old Joy' };
  const elsewhere = frame({ nowPlaying: { track: other, hasDevice: true, isPaused: true, positionMs: 0 } }).map(stripAnsi);
  assert.ok(elsewhere.some((line) => line.includes('⏸ Old Joy  0:00')));
});
