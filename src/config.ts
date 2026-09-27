import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import envPaths from 'env-paths';

import type { SupportedLanguage } from './i18n/index.js';

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
  scope: string;
};

export type ResumeState = {
  /**
   * URI of the next not-yet-decided track, rather than a raw position index —
   * a plain offset doesn't survive songs removed from the source between
   * sessions (everything after a removal shifts one slot earlier), while a
   * track's URI still identifies it wherever it now sits.
   */
  nextTrackUri: string;
  updatedAt: string;
};

export type StoredConfig = {
  clientId?: string;
  redirectPort?: number;
  tokens?: Tokens;
  /** Keyed by playlist id, or the literal "liked-songs". */
  resume?: Record<string, ResumeState>;
  /** Explicit override; unset means "detect from the OS locale". Set via `spoticlean setup`. */
  language?: SupportedLanguage;
};

const paths = envPaths('spoticlean-cli', { suffix: '' });
const configFile = path.join(paths.config, 'config.json');

let cache: StoredConfig | undefined;

async function ensureDir() {
  await mkdir(paths.config, { recursive: true });
}

export async function loadConfig(): Promise<StoredConfig> {
  if (cache) return cache;
  try {
    const raw = await readFile(configFile, 'utf8');
    cache = JSON.parse(raw) as StoredConfig;
  } catch {
    cache = {};
  }
  return cache;
}

export async function saveConfig(config: StoredConfig): Promise<void> {
  cache = config;
  await ensureDir();
  await writeFile(configFile, JSON.stringify(config, null, 2), 'utf8');
}

export async function updateConfig(
  patch: (config: StoredConfig) => StoredConfig | void
): Promise<StoredConfig> {
  const current = await loadConfig();
  const result = patch(current) ?? current;
  await saveConfig(result);
  return result;
}

export function configFilePath(): string {
  return configFile;
}
