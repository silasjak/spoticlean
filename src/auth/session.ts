import * as p from '@clack/prompts';
import pc from 'picocolors';
import open from 'open';

import { loadConfig, updateConfig, type Tokens } from '../config.js';
import { AuthCancelled } from '../errors.js';
import { waitForAuthorizationCode } from './callbackServer.js';
import { buildAuthorizeUrl, exchangeCodeForTokens, redirectUriFor, refreshTokens } from './oauth.js';
import { createCodeChallenge, createCodeVerifier, createState } from './pkce.js';

const DEFAULT_PORT = 8888;
/** Refresh a bit before actual expiry to avoid racing a request against it. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

async function promptClientId(port: number): Promise<string> {
  p.log.step('Spotify-App wird benötigt');
  p.note(
    [
      `${pc.bold('1.')} Öffne ${pc.cyan('https://developer.spotify.com/dashboard')} und erstelle eine App.`,
      `${pc.bold('2.')} Trage als Redirect URI genau das hier ein:`,
      `   ${pc.green(redirectUriFor(port))}`,
      `${pc.bold('3.')} Kopiere die "Client ID" aus den App-Einstellungen (kein Secret nötig).`,
    ].join('\n'),
    'Einmalige Einrichtung'
  );

  const clientId = await p.text({
    message: 'Spotify Client ID',
    validate: (value) => (value.trim().length === 0 ? 'Client ID darf nicht leer sein.' : undefined),
  });

  if (p.isCancel(clientId)) throw new AuthCancelled();
  return clientId.trim();
}

async function performLogin(clientId: string, port: number): Promise<Tokens> {
  const redirectUri = redirectUriFor(port);
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const state = createState();
  const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, codeChallenge, state });

  const callback = waitForAuthorizationCode({ port, expectedState: state });

  const opened = await open(authorizeUrl).then(() => true).catch(() => false);
  if (opened) {
    p.log.info('Browser wurde geöffnet — bitte bei Spotify anmelden und die Berechtigung erteilen.');
  } else {
    p.log.warn('Browser konnte nicht automatisch geöffnet werden. Öffne diesen Link manuell:');
  }
  p.log.message(pc.underline(authorizeUrl));

  const spinner = p.spinner();
  spinner.start('Warte auf Bestätigung im Browser…');

  let code: string;
  try {
    ({ code } = await callback);
  } catch (error) {
    spinner.stop('Anmeldung abgebrochen.', 1);
    throw error;
  }
  spinner.stop('Anmeldung bestätigt.');

  const tokenResponse = await exchangeCodeForTokens({ clientId, redirectUri, code, codeVerifier });
  if (!tokenResponse.refresh_token) {
    throw new Error('Spotify hat keinen Refresh-Token geliefert.');
  }

  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
    scope: tokenResponse.scope,
  };
}

/**
 * Returns a valid access token, transparently refreshing or (re-)running the
 * PKCE login flow as needed. This is the only entry point the rest of the
 * app should use to get authenticated.
 */
export async function getAccessToken(): Promise<string> {
  const config = await loadConfig();
  const port = config.redirectPort ?? DEFAULT_PORT;

  const clientId = config.clientId ?? process.env.SPOTICLEAN_CLIENT_ID ?? (await promptClientId(port));
  if (clientId !== config.clientId) {
    await updateConfig((c) => {
      c.clientId = clientId;
      c.redirectPort = port;
    });
  }

  if (config.tokens && config.tokens.expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return config.tokens.accessToken;
  }

  if (config.tokens?.refreshToken) {
    try {
      const refreshed = await refreshTokens({ clientId, refreshToken: config.tokens.refreshToken });
      const tokens: Tokens = {
        accessToken: refreshed.access_token,
        // Spotify doesn't always return a new refresh token; keep the old one if so.
        refreshToken: refreshed.refresh_token ?? config.tokens.refreshToken,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
        scope: refreshed.scope,
      };
      await updateConfig((c) => {
        c.tokens = tokens;
      });
      return tokens.accessToken;
    } catch {
      p.log.warn('Sitzung konnte nicht erneuert werden — erneute Anmeldung nötig.');
    }
  }

  const tokens = await performLogin(clientId, port);
  await updateConfig((c) => {
    c.tokens = tokens;
  });
  return tokens.accessToken;
}

export async function logout(): Promise<void> {
  await updateConfig((c) => {
    delete c.tokens;
  });
}

/** Forces the next getAccessToken() call to refresh instead of using the cache. */
export async function invalidateAccessToken(): Promise<void> {
  await updateConfig((c) => {
    if (c.tokens) c.tokens.expiresAt = 0;
  });
}
