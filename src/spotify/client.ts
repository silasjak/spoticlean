import { getAccessToken, invalidateAccessToken } from '../auth/session.js';

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

/**
 * Performs one Spotify Web API request, retrying once on 401 (after
 * forcing a token refresh) and up to 3 times on 429 (honouring
 * Retry-After). Returns `undefined` for empty (204) responses.
 */
async function request<T>(path: string, options: RequestOptions = {}, attempt = 0): Promise<T | undefined> {
  const token = await getAccessToken();
  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

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
    try {
      const payload = (await response.json()) as {
        error?: { message?: string; reason?: string } | string;
      };
      if (typeof payload.error === 'object' && payload.error) {
        message = payload.error.message ?? message;
        reason = payload.error.reason;
      } else if (typeof payload.error === 'string') {
        message = payload.error;
      }
    } catch {
      // response wasn't JSON — keep the statusText as the message
    }
    throw new SpotifyApiError(message, response.status, reason);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : undefined;
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
