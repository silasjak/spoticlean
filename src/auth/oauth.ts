import { t } from '../i18n/index.js';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

/**
 * Scopes needed to: read the user's playlists and profile, read/modify
 * Liked Songs, modify playlist contents, and control playback (Spotify
 * Connect) on whichever device the user has open.
 */
export const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
  'user-library-modify',
  'user-read-playback-state',
  'user-modify-playback-state',
] as const;

export type TokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

export function redirectUriFor(port: number): string {
  return `http://127.0.0.1:${port}/callback`;
}

export function buildAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', options.codeChallenge);
  url.searchParams.set('state', options.state);
  url.searchParams.set('scope', SCOPES.join(' '));
  return url.toString();
}

async function postForm(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(t('auth.oauth.tokenEndpointError', { status: response.status, body: text }));
  }

  return (await response.json()) as TokenResponse;
}

export function exchangeCodeForTokens(options: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  return postForm({
    grant_type: 'authorization_code',
    client_id: options.clientId,
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: options.codeVerifier,
  });
}

export function refreshTokens(options: {
  clientId: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  return postForm({
    grant_type: 'refresh_token',
    client_id: options.clientId,
    refresh_token: options.refreshToken,
  });
}
