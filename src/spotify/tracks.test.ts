import assert from 'node:assert/strict';
import { test } from 'node:test';

import './testTokenSetup.js'; // must run before client.js (transitively) reads config — see that file
import { initI18n } from '../i18n/index.js';
import { installFetchMock, jsonResponse } from './fetchMock.js';
import { fetchAllTracks, fetchTracksPage, removeTrack, restoreTrack } from './tracks.js';
import type { SpotifyTrack } from './types.js';

await initI18n('de'); // tracks.ts's own error messages go through t(); see client.test.ts for why this is needed

function makeRawTrack(id: string): SpotifyTrack {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: id,
    duration_ms: 180_000,
    artists: [{ name: 'Artist' }],
    album: { name: 'Album', images: [] },
    preview_url: null,
    is_local: false,
  };
}

test('a playlist source reads the "item" field and normalizes it to "track"', async () => {
  const { restore } = installFetchMock((url) => {
    assert.match(url, /^https:\/\/api\.spotify\.com\/v1\/playlists\/pl1\/items\?/);
    return jsonResponse(200, {
      items: [{ added_at: '2026-01-01T00:00:00Z', item: makeRawTrack('a') }],
      total: 1,
      limit: 50,
      offset: 0,
      next: null,
    });
  });
  try {
    const page = await fetchTracksPage({ kind: 'playlist', id: 'pl1', name: 'Test' }, 0);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]!.track.uri, 'spotify:track:a');
  } finally {
    restore();
  }
});

test('the liked-songs source reads the "track" field directly', async () => {
  const { restore } = installFetchMock((url) => {
    assert.match(url, /^https:\/\/api\.spotify\.com\/v1\/me\/tracks\?/);
    return jsonResponse(200, {
      items: [{ added_at: '2026-01-01T00:00:00Z', track: makeRawTrack('b') }],
      total: 1,
      limit: 50,
      offset: 0,
      next: null,
    });
  });
  try {
    const page = await fetchTracksPage({ kind: 'liked', name: 'Liked Songs' }, 0);
    assert.equal(page.items[0]!.track.uri, 'spotify:track:b');
  } finally {
    restore();
  }
});

test('an entry with neither "item" nor "track" throws instead of silently producing a broken TrackItem', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(200, { items: [{ added_at: '2026-01-01T00:00:00Z' }], total: 1, limit: 50, offset: 0, next: null })
  );
  try {
    await assert.rejects(() => fetchTracksPage({ kind: 'liked', name: 'Liked Songs' }, 0), /track|item/);
  } finally {
    restore();
  }
});

test('fetchAllTracks pages (by actual items returned, not just the requested limit) until the declared total is reached', async () => {
  const requestedOffsets: number[] = [];
  const { restore } = installFetchMock((url) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    requestedOffsets.push(offset);
    // One item per page regardless of the limit=50 actually requested —
    // exercises advancing by page.items.length, not the requested limit.
    return jsonResponse(200, {
      items: [{ added_at: '2026-01-01T00:00:00Z', track: makeRawTrack(`t${offset}`) }],
      total: 2,
      limit: 50,
      offset,
      next: offset + 1 < 2 ? 'more' : null,
    });
  });
  try {
    const all = await fetchAllTracks({ kind: 'liked', name: 'Liked Songs' });
    assert.deepEqual(
      all.map((i) => i.track.id),
      ['t0', 't1']
    );
    assert.deepEqual(requestedOffsets, [0, 1]);
  } finally {
    restore();
  }
});

test('fetchAllTracks stops on an empty page instead of looping forever if the declared total is never reached', async () => {
  const { restore } = installFetchMock(() =>
    // total (5) is never actually reached by real items — only the
    // safety net (an empty page) can end this loop.
    jsonResponse(200, { items: [], total: 5, limit: 50, offset: 0, next: null })
  );
  try {
    const all = await fetchAllTracks({ kind: 'liked', name: 'Liked Songs' });
    assert.deepEqual(all, []);
  } finally {
    restore();
  }
});

test('fetchAllTracks reports progress after each page', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(200, {
      items: [{ added_at: '2026-01-01T00:00:00Z', track: makeRawTrack('only') }],
      total: 1,
      limit: 50,
      offset: 0,
      next: null,
    })
  );
  const progress: [number, number][] = [];
  try {
    await fetchAllTracks({ kind: 'liked', name: 'Liked Songs' }, (loaded, total) => progress.push([loaded, total]));
    assert.deepEqual(progress, [[1, 1]]);
  } finally {
    restore();
  }
});

test('removeTrack on a playlist DELETEs /playlists/{id}/items with the track URI', async () => {
  const { calls, restore } = installFetchMock(() => jsonResponse(200, {}));
  try {
    await removeTrack({ kind: 'playlist', id: 'pl1', name: 'Test' }, makeRawTrack('a'));
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/playlists\/pl1\/items$/);
    assert.equal(calls[0]!.init?.method, 'DELETE');
    assert.deepEqual(JSON.parse(calls[0]!.init?.body as string), { items: [{ uri: 'spotify:track:a' }] });
  } finally {
    restore();
  }
});

test('removeTrack on Liked Songs DELETEs /me/library with the URI as a query param', async () => {
  const { calls, restore } = installFetchMock(() => jsonResponse(200, {}));
  try {
    await removeTrack({ kind: 'liked', name: 'Liked Songs' }, makeRawTrack('a'));
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/me\/library\?uris=spotify%3Atrack%3Aa$/);
    assert.equal(calls[0]!.init?.method, 'DELETE');
  } finally {
    restore();
  }
});

test('removeTrack refuses a local file from Liked Songs without making any request', async () => {
  const { calls, restore } = installFetchMock(() => jsonResponse(200, {}));
  try {
    await assert.rejects(() => removeTrack({ kind: 'liked', name: 'Liked Songs' }, { ...makeRawTrack('a'), is_local: true }));
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test('restoreTrack on a playlist POSTs /playlists/{id}/items with {uris:[...]}', async () => {
  const { calls, restore } = installFetchMock(() => jsonResponse(200, {}));
  try {
    await restoreTrack({ kind: 'playlist', id: 'pl1', name: 'Test' }, makeRawTrack('a'));
    assert.equal(calls[0]!.init?.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0]!.init?.body as string), { uris: ['spotify:track:a'] });
  } finally {
    restore();
  }
});

test('restoreTrack refuses a local file for Liked Songs without making any request', async () => {
  const { calls, restore } = installFetchMock(() => jsonResponse(200, {}));
  try {
    await assert.rejects(() =>
      restoreTrack({ kind: 'liked', name: 'Liked Songs' }, { ...makeRawTrack('a'), is_local: true })
    );
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});
