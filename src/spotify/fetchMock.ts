// Shared `fetch()` mocking for client.test.ts/tracks.test.ts/playlists.test.ts.
// Not a *.test.ts file itself, so `npm test`'s glob skips it.

export type MockCall = { url: string; init: RequestInit | undefined };

/** A ready-made `Response` with a JSON body and the content-type client.ts checks for. */
export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** An empty response (204/202, or a non-JSON body) with no content-type. */
export function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

/**
 * Replaces `globalThis.fetch` with `handler` for the duration of the test,
 * recording every call. `handler` dispatches on URL — needed because a 401
 * retry (or an expired token in general) makes client.ts's `getAccessToken()`
 * call through to Spotify's *token* endpoint too, not just the API one.
 * Returns a restore function; always call it (a `finally` block or
 * `t.after()`), or a later test starts running against a stale mock.
 */
export function installFetchMock(
  handler: (url: string, init: RequestInit | undefined, calls: MockCall[]) => Response | Promise<Response>
): { calls: MockCall[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: MockCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return handler(url, init, calls);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
