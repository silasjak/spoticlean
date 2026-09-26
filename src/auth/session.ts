import * as p from '@clack/prompts';
import pc from 'picocolors';
import open from 'open';

import { loadConfig, updateConfig, type Tokens } from '../config.js';
import { AuthCancelled } from '../errors.js';
import { detectLanguage, initI18n, t, type SupportedLanguage } from '../i18n/index.js';
import { waitForAuthorizationCode } from './callbackServer.js';
import { buildAuthorizeUrl, exchangeCodeForTokens, redirectUriFor, refreshTokens } from './oauth.js';
import { createCodeChallenge, createCodeVerifier, createState } from './pkce.js';

const DEFAULT_PORT = 8888;
/** Refresh a bit before actual expiry to avoid racing a request against it. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * Every user needs their own free Spotify app (just a Client ID — no
 * secret, since this uses PKCE). That's unavoidable: Spotify doesn't
 * offer an API to create dashboard apps on someone's behalf, it's a
 * one-time manual step on Spotify's own website. Everything past that
 * point (this prompt included) is handled entirely by the CLI, no config
 * files to hand-edit.
 */
async function promptAppSetup(defaultPort: number): Promise<{ clientId: string; port: number }> {
  const portInput = await p.text({
    message: t('auth.setup.portQuestion'),
    initialValue: String(defaultPort),
    validate: (value) => {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1024 || n > 65535) return t('auth.setup.portValidation');
      return undefined;
    },
  });
  if (p.isCancel(portInput)) throw new AuthCancelled();
  const port = Number(portInput);

  p.log.step(t('auth.setup.appNeededStep'));
  p.note(
    [
      `${pc.bold('1.')} ${t('auth.setup.step1', { url: pc.cyan('https://developer.spotify.com/dashboard') })}`,
      `${pc.bold('2.')} ${t('auth.setup.step2', { exact: pc.bold(t('auth.setup.exactWord')) })}`,
      `   ${pc.green(redirectUriFor(port))}`,
      `${pc.bold('3.')} ${t('auth.setup.step3')}`,
    ].join('\n'),
    t('auth.setup.noteTitle')
  );

  const clientId = await p.text({
    message: t('auth.setup.clientIdQuestion'),
    validate: (value) => (value.trim().length === 0 ? t('auth.setup.clientIdValidation') : undefined),
  });
  if (p.isCancel(clientId)) throw new AuthCancelled();

  return { clientId: clientId.trim(), port };
}

/** Offers Deutsch/English (each shown in its own name, not translated — the standard convention for a language picker) and persists + activates the choice right away. */
async function promptLanguage(current: SupportedLanguage): Promise<SupportedLanguage> {
  const choice = await p.select({
    message: t('auth.setup.languageQuestion'),
    initialValue: current,
    options: [
      { value: 'de' as const, label: 'Deutsch' },
      { value: 'en' as const, label: 'English' },
    ],
  });
  if (p.isCancel(choice)) throw new AuthCancelled();
  return choice;
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
    p.log.info(t('auth.login.browserOpened'));
  } else {
    p.log.warn(t('auth.login.browserFailed'));
  }
  p.log.message(pc.underline(authorizeUrl));

  const spinner = p.spinner();
  spinner.start(t('auth.login.waiting'));

  let code: string;
  try {
    ({ code } = await callback);
  } catch (error) {
    spinner.stop(t('auth.login.cancelled'), 1);
    throw error;
  }
  spinner.stop(t('auth.login.confirmed'));

  const tokenResponse = await exchangeCodeForTokens({ clientId, redirectUri, code, codeVerifier });
  if (!tokenResponse.refresh_token) {
    throw new Error(t('auth.login.noRefreshToken'));
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

  let clientId = config.clientId;
  let port = config.redirectPort ?? DEFAULT_PORT;

  if (!clientId) {
    // Env vars are an optional shortcut for advanced/scripted use — the
    // interactive prompt below covers everyone else, no file editing needed.
    if (process.env.SPOTICLEAN_CLIENT_ID) {
      clientId = process.env.SPOTICLEAN_CLIENT_ID;
      port = Number(process.env.SPOTICLEAN_PORT ?? port) || port;
    } else {
      ({ clientId, port } = await promptAppSetup(port));
    }
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
      p.log.warn(t('auth.token.refreshFailed'));
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

/**
 * Explicitly (re-)runs the one-time setup — asks for port + Client ID again
 * (e.g. to fix a typo, switch Spotify apps, or resolve a port conflict) and
 * logs in right away. Entirely CLI-driven; never requires touching config.json.
 */
export async function runSetup(): Promise<void> {
  const config = await loadConfig();

  const language = await promptLanguage(config.language ?? detectLanguage());
  await initI18n(language); // switch right away so the rest of this same setup shows in it
  await updateConfig((c) => {
    c.language = language;
  });

  const { clientId, port } = await promptAppSetup(config.redirectPort ?? DEFAULT_PORT);
  await updateConfig((c) => {
    c.clientId = clientId;
    c.redirectPort = port;
    delete c.tokens;
  });

  const tokens = await performLogin(clientId, port);
  await updateConfig((c) => {
    c.tokens = tokens;
  });
  p.log.success(t('auth.setup.completed'));
}

/** Forces the next getAccessToken() call to refresh instead of using the cache. */
export async function invalidateAccessToken(): Promise<void> {
  await updateConfig((c) => {
    if (c.tokens) c.tokens.expiresAt = 0;
  });
}
