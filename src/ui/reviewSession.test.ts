import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ResumeState } from '../config.js';
import type { SpotifyTrack, TrackItem } from '../spotify/types.js';
import { findResumeIndex, nextResumeState } from './reviewSession.js';

function makeTrack(uri: string): SpotifyTrack {
  return {
    id: uri,
    uri,
    name: uri,
    duration_ms: 180_000,
    artists: [{ name: 'Artist' }],
    album: { name: 'Album', images: [] },
    preview_url: null,
    is_local: false,
  };
}

function makeTracks(uris: string[]): TrackItem[] {
  return uris.map((uri) => ({ added_at: '2026-01-02T00:00:00Z', track: makeTrack(uri) }));
}

function resumeState(nextTrackUri: string): ResumeState {
  return { nextTrackUri, updatedAt: '2026-01-02T00:00:00Z' };
}

test('findResumeIndex survives songs removed from earlier in the source since the last session', () => {
  // The exact reported scenario: 150 tracks, stopped right after deciding
  // #130 (0-based index 130 is next up: tracks 0-59 were kept, 60-129 — 70
  // of them — were removed). The next session's fetch has only the 60 kept
  // + the 20 never reached, in the same relative order, so the cursor's
  // track (never touched, so it's unaffected by any of this) now sits at
  // index 60 instead of 130.
  const uris = Array.from({ length: 150 }, (_, i) => `spotify:track:${i}`);
  const freshUris = [...uris.slice(0, 60), ...uris.slice(130)];
  assert.equal(freshUris.length, 80);

  const fresh = makeTracks(freshUris);
  const index = findResumeIndex(fresh, resumeState('spotify:track:130'));

  assert.equal(index, 60);
  assert.equal(fresh[index]!.track.uri, 'spotify:track:130');
});

test('findResumeIndex ignores a plain numeric offset from the old resume format', () => {
  // Before this fix, saved state was `{ offset: 130, total: 150 }` — no
  // `nextTrackUri` at all. Loading that shouldn't throw or resume to the
  // wrong track; it should just look like nothing to resume.
  const fresh = makeTracks(['spotify:track:a', 'spotify:track:b']);
  const oldFormat = { offset: 1, total: 2, updatedAt: '2026-01-02T00:00:00Z' } as unknown as ResumeState;

  assert.equal(findResumeIndex(fresh, oldFormat), 0);
});

test('findResumeIndex returns 0 when the saved track is gone entirely', () => {
  const fresh = makeTracks(['spotify:track:a', 'spotify:track:b']);
  assert.equal(findResumeIndex(fresh, resumeState('spotify:track:removed-elsewhere')), 0);
});

test('findResumeIndex returns 0 when the saved track is already first — nothing to skip', () => {
  const fresh = makeTracks(['spotify:track:a', 'spotify:track:b']);
  assert.equal(findResumeIndex(fresh, resumeState('spotify:track:a')), 0);
});

test('findResumeIndex returns 0 with no saved state at all (first run for this source)', () => {
  const fresh = makeTracks(['spotify:track:a']);
  assert.equal(findResumeIndex(fresh, undefined), 0);
});

test('nextResumeState points at the given index\'s track', () => {
  const tracks = makeTracks(['spotify:track:a', 'spotify:track:b']);
  const state = nextResumeState(tracks, 1);
  assert.equal(state?.nextTrackUri, 'spotify:track:b');
});

test('nextResumeState is undefined once every track has a decision (index past the end)', () => {
  const tracks = makeTracks(['spotify:track:a', 'spotify:track:b']);
  assert.equal(nextResumeState(tracks, 2), undefined);
});
