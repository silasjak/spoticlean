import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initI18n } from '../i18n/index.js';
import type { SpotifyTrack, TrackItem } from '../spotify/types.js';
import { visibleLength } from './terminal.js';
import { buildReviewFrame, type Decision, type HistoryEntry } from './reviewFrame.js';

// buildReviewFrame() renders through t() — these assertions check the
// (existing) German copy specifically, so pin the language regardless of
// whoever's machine/CI runs this.
await initI18n('de');

function makeTrack(name: string, overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return {
    id: name,
    uri: `spotify:track:${name}`,
    name,
    duration_ms: 180_000,
    artists: [{ name: 'Ein Artist' }],
    album: { name: 'Ein Album', images: [] },
    preview_url: null,
    is_local: false,
    ...overrides,
  };
}

function makeItem(overrides: Partial<SpotifyTrack> = {}): TrackItem {
  return { added_at: '2026-01-02T00:00:00Z', track: makeTrack('Ein Song', overrides) };
}

function makeHistory(n: number, decision: Decision = 'kept'): HistoryEntry[] {
  return Array.from({ length: n }, (_, i) => ({ track: makeTrack(`Song ${i}`), decision }));
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
    history: [] as HistoryEntry[],
    historyCursor: null,
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
  const minimum = buildReviewFrame(baseState({ height: 0 })).length;
  for (const height of [minimum, minimum + 1, 24, 40]) {
    const frame = buildReviewFrame(baseState({ height }));
    assert.ok(frame.length <= height, `height=${height} produced ${frame.length} lines`);
  }
});

test('degenerately small terminals do not throw or grow unbounded', () => {
  const minimum = buildReviewFrame(baseState({ height: 0 })).length;
  for (const height of [3, 1, 0, -5]) {
    const frame = buildReviewFrame(baseState({ height }));
    assert.equal(frame.length, minimum);
  }
});

test('history list grows to fill the space left after header/card/footer', () => {
  const history = makeHistory(50);
  const short = buildReviewFrame(baseState({ height: 15, history }));
  const tall = buildReviewFrame(baseState({ height: 40, history }));
  assert.ok(tall.length > short.length);
  assert.ok(tall.length <= 40);
});

test('shows a placeholder when there is no history and no current track either', () => {
  const frame = buildReviewFrame(baseState({ history: [], item: undefined })).join('\n');
  assert.match(frame, /Noch keine Entscheidungen/);
});

test('the pending current track gets its own grayed-out row at the end of the list', () => {
  const item = makeItem({ name: 'Song 4' });
  const withoutHistory = buildReviewFrame(baseState({ history: [], item })).join('\n');
  assert.doesNotMatch(withoutHistory, /Noch keine Entscheidungen/);
  assert.match(withoutHistory, /→ Song 4/);

  const history = makeHistory(3);
  const frame = buildReviewFrame(baseState({ history, item }));
  // Card header also says "Song 4" (bolded, no arrow) — match the list row specifically.
  const line = frame.find((l) => l.includes('→ Song 4'));
  assert.ok(line, 'expected the current track to appear in the history list');
  // eslint-disable-next-line no-control-regex -- deliberately matching the ESC control code (SGR "bright-black bg")
  assert.match(line!, /\x1b\[100m/); // picocolors' pc.bgBlackBright()
  // eslint-disable-next-line no-control-regex -- must NOT be inverse or yellow, those mean something else
  assert.doesNotMatch(line!, /\x1b\[7m|\x1b\[43m/);
});

test('the current-track row disappears from the history list while editing a past entry', () => {
  const history = makeHistory(3);
  const item = makeItem({ name: 'Song 4' });
  const frame = buildReviewFrame(baseState({ history, item, editing: true, editingIndex: 1 })).join('\n');
  // "Song 4" still shows up in the card header itself (bolded, not "→ ...");
  // it's the extra grayed-out list row that must be gone while editing.
  assert.doesNotMatch(frame, /→ Song 4/);
});

test('omits the "Verlauf" section entirely rather than pushing the footer off-screen', () => {
  const minimum = buildReviewFrame(baseState({ height: 0 })).length;
  const frame = buildReviewFrame(baseState({ height: minimum, history: makeHistory(3) }));
  // The "↑/↓ Verlauf" footer hint legitimately still says "Verlauf" — check
  // for the section's own divider specifically, not the word anywhere.
  assert.doesNotMatch(frame.join('\n'), /├─ Verlauf/);
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

test('reserves exactly one status row whether or not there is a message', () => {
  const empty = buildReviewFrame(baseState()).length;
  const withStatus = buildReviewFrame(baseState({ status: { text: 'Behalten: X' } })).length;
  assert.equal(empty, withStatus);
});

test('the status message appears in the frame', () => {
  const frame = buildReviewFrame(baseState({ status: { text: 'Ganz besondere Statuszeile' } })).join('\n');
  assert.match(frame, /Ganz besondere Statuszeile/);
});

test('browsing mode swaps the footer hints for navigation hints', () => {
  const normal = buildReviewFrame(baseState({ history: makeHistory(3), historyCursor: null })).join('\n');
  const browsing = buildReviewFrame(baseState({ history: makeHistory(3), historyCursor: 1 })).join('\n');
  assert.match(normal, /behalten/);
  assert.doesNotMatch(browsing, /behalten/);
  assert.match(browsing, /korrigieren/);
});

test('editing mode shows keep/remove/cancel but hides the history-browse hints', () => {
  const frame = buildReviewFrame(baseState({ history: makeHistory(3), historyCursor: null, editing: true })).join(
    '\n'
  );
  assert.match(frame, /behalten/);
  assert.match(frame, /entfernen/);
  assert.match(frame, /abbrechen/);
  assert.doesNotMatch(frame, /letzte korrigieren/);
});

test('the track being edited is marked with a note in the history list, not the header', () => {
  const history = makeHistory(3);
  const frame = buildReviewFrame(baseState({ history, editing: true, editingIndex: 1 })).join('\n');
  assert.match(frame, /Song 1 \(wird korrigiert\)/);
  assert.doesNotMatch(frame, /Song 0 \(wird korrigiert\)/);
  assert.doesNotMatch(frame, /Korrektur —/); // no more header/card banner
});

test('the edited row gets a yellow tint, distinct from the browse-cursor row', () => {
  const history = makeHistory(3);
  const editedFrame = buildReviewFrame(baseState({ history, editing: true, editingIndex: 1 }));
  const editedLine = editedFrame.find((l) => l.includes('Song 1'));
  assert.ok(editedLine);
  // eslint-disable-next-line no-control-regex -- deliberately matching the ESC control code (SGR "yellow bg")
  assert.match(editedLine!, /\x1b\[43m/); // picocolors' pc.bgYellow()
  // eslint-disable-next-line no-control-regex -- must NOT be full inverse video, that's the cursor's style
  assert.doesNotMatch(editedLine!, /\x1b\[7m/);

  const cursorFrame = buildReviewFrame(baseState({ history, historyCursor: 1 }));
  const cursorLine = cursorFrame.find((l) => l.includes('Song 1'));
  assert.ok(cursorLine);
  // eslint-disable-next-line no-control-regex -- deliberately matching the ESC control character (SGR "inverse")
  assert.match(cursorLine!, /\x1b\[7m/); // picocolors' pc.inverse()
});

test('scrolling keeps the edited row visible even deep in a long history', () => {
  const history = makeHistory(50);
  const frame = buildReviewFrame(baseState({ height: 15, history, editing: true, editingIndex: 3 })).join('\n');
  assert.match(frame, /Song 3 \(wird korrigiert\)/);
});

test('the highlighted history row is rendered in inverse video', () => {
  const history = makeHistory(3);
  const frame = buildReviewFrame(baseState({ history, historyCursor: 1 }));
  const line = frame.find((l) => l.includes('Song 1'));
  assert.ok(line, 'expected to find the highlighted track in the frame');
  // eslint-disable-next-line no-control-regex -- deliberately matching the ESC control character (SGR "inverse")
  assert.match(line!, /\x1b\[7m/); // picocolors' pc.inverse()
});

test('without a cursor, the history view shows the most recent entries (tail)', () => {
  const history = makeHistory(50);
  const frame = buildReviewFrame(baseState({ height: 15, history, historyCursor: null })).join('\n');
  assert.match(frame, /Song 49/); // most recent
  assert.doesNotMatch(frame, /Song 0\b/); // long scrolled off
});

test('scrolling keeps the cursor visible even far back in a long history', () => {
  const history = makeHistory(50);
  const frame = buildReviewFrame(baseState({ height: 15, history, historyCursor: 2 })).join('\n');
  assert.match(frame, /Song 2\b/);
});

test('scrolling keeps the cursor visible near the very end too', () => {
  const history = makeHistory(50);
  const frame = buildReviewFrame(baseState({ height: 15, history, historyCursor: 49 })).join('\n');
  assert.match(frame, /Song 49/);
});

test('a short history is never clipped regardless of cursor position', () => {
  const history = makeHistory(5);
  for (let cursor = 0; cursor < 5; cursor++) {
    const frame = buildReviewFrame(baseState({ history, historyCursor: cursor })).join('\n');
    for (let i = 0; i < 5; i++) assert.match(frame, new RegExp(`Song ${i}\\b`));
  }
});
