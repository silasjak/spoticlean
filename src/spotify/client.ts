import { getAccessToken, invalidateAccessToken } from '../auth/session.js';
import { debugLog } from '../debug.js';
import { t } from '../i18n/index.js';

const API_BASE = 'https://api.spotify.com/v1';

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function headersToObject(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

/**
 * Performs one Spotify Web API request, retrying once on 401 (after
 * forcing a token refresh) and up to 3 times on 429 (honouring
 * Retry-After). Returns `undefined` for empty (204) responses.
 */
async function request<T>(path: string, options: RequestOptions = {}, attempt = 0): Promise<T | undefined> {
  const token = await getAccessToken();
  const method = options.method ?? 'GET';
  const url = buildUrl(path, options.query);

  // Never log the Authorization header itself — only that one was sent.
  debugLog(`--> ${method} ${url}${options.body ? ` body=${JSON.stringify(options.body)}` : ''} (attempt ${attempt})`);

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      // Node's fetch sends no User-Agent by default; some network-level
      // filters (proxies, WAFs) treat that as bot-like and block the
      // request with a bare, content-less 403 before it ever reaches
      // Spotify's own API logic.
      'User-Agent': 'spoticlean-cli (+https://github.com/silasjak/spoticlean-cli)',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Read the body exactly once, regardless of which branch below ends up
  // using it — also means every response (retries included) shows up fully
  // in the debug log, not just the ones that happen to reach a body read.
  const rawText = await response.text().catch(() => '');

  debugLog(
    `<-- ${response.status} ${response.statusText} ${method} ${url}\n` +
      `    headers: ${JSON.stringify(headersToObject(response.headers))}\n` +
      `    body: ${rawText ? rawText.slice(0, 2000) : '(empty)'}`
  );

  if (response.status === 401 && attempt < 1) {
    await invalidateAccessToken();
    return request<T>(path, options, attempt + 1);
  }

  if (response.status === 429 && attempt < 3) {
    const retryAfterSeconds = Number(response.headers.get('retry-after') ?? '1');
    await new Promise((resolve) => setTimeout(resolve, (retryAfterSeconds + 0.5) * 1000));
    return request<T>(path, options, attempt + 1);
  }

  if (response.status === 204 || response.status === 202) {
    return undefined;
  }

  if (!response.ok) {
    let reason: string | undefined;
    let message = response.statusText;
    let matchedSpotifyShape = false;

    if (rawText) {
      try {
        const payload = JSON.parse(rawText) as { error?: { message?: string; reason?: string } | string };
        if (typeof payload.error === 'object' && payload.error) {
          message = payload.error.message ?? message;
          reason = payload.error.reason;
          matchedSpotifyShape = true;
        } else if (typeof payload.error === 'string') {
          message = payload.error;
          matchedSpotifyShape = true;
        }
      } catch {
        // not JSON at all
      }

      // A body that isn't Spotify's usual {error:{...}} shape — e.g. a
      // proxy/WAF block page — is exactly what's worth seeing to tell that
      // apart from a genuine, informative Spotify API error.
      if (!matchedSpotifyShape) {
        message = `${message} — ${rawText.replace(/\s+/g, ' ').trim().slice(0, 160)}`;
      }
    }

    // If Spotify (or whatever answered) gave us a request id, include it —
    // useful when reporting a persistent issue.
    const traceId =
      response.headers.get('client-trace-id') ?? response.headers.get('x-request-id') ?? undefined;
    throw new SpotifyApiError(traceId ? `${message} [trace: ${traceId}]` : message, response.status, reason);
  }

  // Endpoints that are documented to return 204 (player control, mainly)
  // occasionally respond 200 with a non-JSON or empty body instead — since
  // none of our callers use the body of those calls anyway, only attempt to
  // parse when the server actually says it sent JSON.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json') || !rawText) {
    return undefined;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new SpotifyApiError(
      t('spotify.client.invalidJson', { method, path, status: response.status, body: rawText.slice(0, 120) }),
      response.status
    );
  }
}

export const spotify = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'POST', body, query }),
  put: <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'PUT', body, query }),
  delete: <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'DELETE', body, query }),
};
