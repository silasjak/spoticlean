import assert from 'node:assert/strict';
import { test } from 'node:test';

import './testTokenSetup.js'; // must run before client.js (transitively) reads config — see that file
import { initI18n } from '../i18n/index.js';
import { emptyResponse, installFetchMock, jsonResponse } from './fetchMock.js';
import { spotify, SpotifyApiError } from './client.js';

// client.ts's own error messages go through t() — uninitialized, i18next
// just returns an empty string, which would make every message assertion
// below vacuously match. Language choice doesn't matter for these; German
// is just what the rest of the suite already pins.
await initI18n('de');

const TOKEN_URL = 'https://accounts.spotify.com/api/token';

function tokenRefreshResponse(): Response {
  return jsonResponse(200, {
    access_token: 'refreshed-token',
    token_type: 'Bearer',
    scope: 'test',
    expires_in: 3600,
    refresh_token: 'refreshed-refresh-token',
  });
}

test('a plain successful GET returns the parsed JSON body', async () => {
  const { restore } = installFetchMock((url) => {
    assert.equal(url, 'https://api.spotify.com/v1/me');
    return jsonResponse(200, { id: 'abc' });
  });
  try {
    assert.deepEqual(await spotify.get('/me'), { id: 'abc' });
  } finally {
    restore();
  }
});

test('query parameters are appended, skipping undefined ones', async () => {
  const { restore } = installFetchMock((url) => {
    assert.equal(url, 'https://api.spotify.com/v1/me/playlists?limit=50');
    return jsonResponse(200, {});
  });
  try {
    await spotify.get('/me/playlists', { limit: 50, offset: undefined });
  } finally {
    restore();
  }
});

test('204 and 202 responses resolve to undefined without touching the body', async () => {
  for (const status of [204, 202]) {
    const { restore } = installFetchMock(() => emptyResponse(status));
    try {
      assert.equal(await spotify.delete('/playlists/x/items'), undefined);
    } finally {
      restore();
    }
  }
});

test('a 200 with a non-JSON content-type resolves to undefined instead of trying to parse it', async () => {
  const { restore } = installFetchMock(() => new Response('OK', { status: 200, headers: { 'content-type': 'text/plain' } }));
  try {
    assert.equal(await spotify.put('/me/player/pause'), undefined);
  } finally {
    restore();
  }
});

test('a 200 that claims JSON but isn\'t throws a SpotifyApiError instead of an unhandled parse error', async () => {
  const { restore } = installFetchMock(() => new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }));
  try {
    await assert.rejects(() => spotify.get('/me'), (error: unknown) => {
      assert.ok(error instanceof SpotifyApiError);
      assert.match(error.message, /not json/);
      return true;
    });
  } finally {
    restore();
  }
});

test('a 401 forces a token refresh and retries exactly once, succeeding on the second attempt', async () => {
  let apiCalls = 0;
  const { calls, restore } = installFetchMock((url) => {
    if (url === TOKEN_URL) return tokenRefreshResponse();
    apiCalls++;
    return apiCalls === 1 ? emptyResponse(401) : jsonResponse(200, { ok: true });
  });
  try {
    assert.deepEqual(await spotify.get('/me'), { ok: true });
    assert.equal(apiCalls, 2);
  } finally {
    restore();
    void calls; // available for debugging a failure; not asserted on directly here
  }
});

test('a 401 that persists past the single retry surfaces as a SpotifyApiError, not an infinite loop', async () => {
  const { restore } = installFetchMock((url) => (url === TOKEN_URL ? tokenRefreshResponse() : emptyResponse(401)));
  try {
    await assert.rejects(() => spotify.get('/me'), (error: unknown) => {
      assert.ok(error instanceof SpotifyApiError);
      assert.equal(error.status, 401);
      return true;
    });
  } finally {
    restore();
  }
});

test('a 429 honours Retry-After and retries, succeeding once the server stops throttling', async () => {
  let apiCalls = 0;
  const { restore } = installFetchMock((url) => {
    if (url === TOKEN_URL) return tokenRefreshResponse();
    apiCalls++;
    return apiCalls === 1 ? emptyResponse(429, { 'retry-after': '0' }) : jsonResponse(200, { ok: true });
  });
  try {
    assert.deepEqual(await spotify.get('/me'), { ok: true });
    assert.equal(apiCalls, 2);
  } finally {
    restore();
  }
});

test('an error with Spotify\'s {error:{message,reason}} shape surfaces both', async () => {
  const { restore } = installFetchMock(() => jsonResponse(403, { error: { message: 'Forbidden by scope', reason: 'FORBIDDEN' } }));
  try {
    await assert.rejects(() => spotify.get('/me'), (error: unknown) => {
      assert.ok(error instanceof SpotifyApiError);
      assert.equal(error.status, 403);
      assert.match(error.message, /Forbidden by scope/);
      assert.equal(error.reason, 'FORBIDDEN');
      return true;
    });
  } finally {
    restore();
  }
});

test('an error with Spotify\'s older plain-string error shape still surfaces a message', async () => {
  const { restore } = installFetchMock(() => jsonResponse(400, { error: 'invalid_request' }));
  try {
    await assert.rejects(() => spotify.get('/me'), /invalid_request/);
  } finally {
    restore();
  }
});

test('a non-Spotify error body (e.g. a WAF/proxy block page) is included rather than swallowed', async () => {
  const { restore } = installFetchMock(
    () => new Response('<html>Access Denied by WAF</html>', { status: 403, statusText: 'Forbidden' })
  );
  try {
    await assert.rejects(() => spotify.get('/me'), /Access Denied by WAF/);
  } finally {
    restore();
  }
});

test('a trace id header is appended to the error message when present', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(500, { error: { message: 'Internal error' } }, { 'x-request-id': 'req-123' })
  );
  try {
    await assert.rejects(() => spotify.get('/me'), /\[trace: req-123\]/);
  } finally {
    restore();
  }
});
