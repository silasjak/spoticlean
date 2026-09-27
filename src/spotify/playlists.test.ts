import assert from 'node:assert/strict';
import { test } from 'node:test';

import './testTokenSetup.js'; // must run before client.js (transitively) reads config — see that file
import { installFetchMock, jsonResponse } from './fetchMock.js';
import { getLikedSongsTotal, getMe, listOwnedPlaylists } from './playlists.js';
import type { Me, SimplifiedPlaylist } from './types.js';

function makePlaylist(id: string, ownerId: string): SimplifiedPlaylist {
  return { id, name: id, owner: { id: ownerId, display_name: ownerId }, collaborative: false };
}

test('getMe returns the parsed profile', async () => {
  const { restore } = installFetchMock((url) => {
    assert.match(url, /\/me$/);
    return jsonResponse(200, { id: 'me-1', display_name: 'Me' });
  });
  try {
    const me = await getMe();
    assert.equal(me.id, 'me-1');
  } finally {
    restore();
  }
});

test('listOwnedPlaylists keeps only playlists owned by the given user', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(200, {
      items: [makePlaylist('mine', 'me-1'), makePlaylist('theirs', 'someone-else')],
      total: 2,
      limit: 50,
      offset: 0,
      next: null,
    })
  );
  try {
    const owned = await listOwnedPlaylists({ id: 'me-1', display_name: 'Me' } as Me);
    assert.deepEqual(
      owned.map((p) => p.id),
      ['mine']
    );
  } finally {
    restore();
  }
});

test('listOwnedPlaylists skips a null item instead of crashing on it', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(200, { items: [null, makePlaylist('mine', 'me-1')], total: 2, limit: 50, offset: 0, next: null })
  );
  try {
    const owned = await listOwnedPlaylists({ id: 'me-1', display_name: 'Me' } as Me);
    assert.deepEqual(
      owned.map((p) => p.id),
      ['mine']
    );
  } finally {
    restore();
  }
});

test('listOwnedPlaylists follows pagination until "next" is null', async () => {
  const requestedOffsets: number[] = [];
  const { restore } = installFetchMock((url) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    requestedOffsets.push(offset);
    const isLastPage = offset === 50;
    return jsonResponse(200, {
      items: [makePlaylist(`p${offset}`, 'me-1')],
      total: 2,
      limit: 50,
      offset,
      next: isLastPage ? null : 'more',
    });
  });
  try {
    const owned = await listOwnedPlaylists({ id: 'me-1', display_name: 'Me' } as Me);
    assert.deepEqual(
      owned.map((p) => p.id),
      ['p0', 'p50']
    );
    assert.deepEqual(requestedOffsets, [0, 50]);
  } finally {
    restore();
  }
});

test('getLikedSongsTotal reads just the declared total, requesting the smallest possible page', async () => {
  const { restore } = installFetchMock((url) => {
    assert.match(url, /\/me\/tracks\?limit=1$/);
    return jsonResponse(200, { items: [], total: 137, limit: 1, offset: 0, next: null });
  });
  try {
    assert.equal(await getLikedSongsTotal(), 137);
  } finally {
    restore();
  }
});
